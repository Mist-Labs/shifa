package org.mistlabs.shifa

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

class ShifaLiteRTModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var engine: Any? = null
  private var activeModelPath: String? = null
  private var activeBackend: String = "GPU"

  override fun getName(): String = NAME

  @ReactMethod
  fun init(modelPath: String, backend: String, maxTokens: Int, promise: Promise) {
    Thread {
      try {
        val memoryInfo = deviceMemoryInfo()
        if (memoryInfo.totalMem in 1 until MIN_RECOMMENDED_RAM_BYTES) {
          promise.reject(
            "SHIFA_LITERT_LOW_MEMORY",
            "This device has ${formatGb(memoryInfo.totalMem)} RAM available to Android. Offline AI needs about ${formatGb(MIN_RECOMMENDED_RAM_BYTES)} RAM, so SHIFA will use the safety protocol checklist."
          )
          return@Thread
        }

        val file = File(modelPath)
        if (!file.exists() || !file.canRead()) {
          promise.reject("SHIFA_LITERT_MODEL_MISSING", "LiteRT model file is not readable: $modelPath")
          return@Thread
        }

        closeEngine()
        engine = createEngine(file.absolutePath, backend, maxTokens.coerceAtLeast(128))
        engine?.javaClass?.getMethod("initialize")?.invoke(engine)
        activeModelPath = file.absolutePath
        activeBackend = normalizeBackend(backend)
        promise.resolve(runtimeInfo())
      } catch (error: Throwable) {
        val cause = rootCause(error)
        promise.reject("SHIFA_LITERT_INIT_FAILED", cause.message ?: cause.toString(), cause)
      }
    }.start()
  }

  @ReactMethod
  fun generate(prompt: String, promise: Promise) {
    val currentEngine = engine
    if (currentEngine == null) {
      promise.reject("SHIFA_LITERT_NOT_READY", "LiteRT engine has not been initialized.")
      return
    }

    Thread {
      var session: AutoCloseable? = null
      try {
        session = createSession(currentEngine)
        promise.resolve(generateContentStream(session, prompt))
      } catch (error: Throwable) {
        val cause = rootCause(error)
        promise.reject("SHIFA_LITERT_GENERATE_FAILED", cause.message ?: cause.toString(), cause)
      } finally {
        session?.close()
      }
    }.start()
  }

  @ReactMethod
  fun sizeInTokens(text: String, promise: Promise) {
    val currentEngine = engine
    if (currentEngine == null) {
      promise.reject("SHIFA_LITERT_NOT_READY", "LiteRT engine has not been initialized.")
      return
    }

    Thread {
      try {
        promise.resolve((text.length / 4).coerceAtLeast(1))
      } catch (error: Throwable) {
        val cause = rootCause(error)
        promise.reject("SHIFA_LITERT_TOKENIZE_FAILED", cause.message ?: cause.toString(), cause)
      }
    }.start()
  }

  @ReactMethod
  fun isReady(promise: Promise) {
    promise.resolve(engine != null)
  }

  @ReactMethod
  fun getRuntimeInfo(promise: Promise) {
    promise.resolve(runtimeInfo())
  }

  @ReactMethod
  fun getDeviceMemoryInfo(promise: Promise) {
    val info = deviceMemoryInfo()
    promise.resolve(
      Arguments.createMap().apply {
        putDouble("totalBytes", info.totalMem.toDouble())
        putDouble("availableBytes", info.availMem.toDouble())
        putBoolean("lowMemory", info.lowMemory)
        putBoolean("meetsRecommendedMemory", info.totalMem >= MIN_RECOMMENDED_RAM_BYTES)
        putDouble("recommendedBytes", MIN_RECOMMENDED_RAM_BYTES.toDouble())
      }
    )
  }

  @ReactMethod
  fun close(promise: Promise) {
    try {
      closeEngine()
      engine = null
      activeModelPath = null
      promise.resolve(true)
    } catch (error: Throwable) {
      val cause = rootCause(error)
      promise.reject("SHIFA_LITERT_CLOSE_FAILED", cause.message ?: cause.toString(), cause)
    }
  }

  private fun rootCause(error: Throwable): Throwable =
    if (error is InvocationTargetException && error.targetException != null) error.targetException else error

  private fun runtimeInfo(): WritableMap =
    Arguments.createMap().apply {
      putBoolean("ready", engine != null)
      activeModelPath?.let { putString("modelPath", it) }
      putString("backend", activeBackend)
    }

  private fun normalizeBackend(backend: String): String =
    when (backend.uppercase()) {
      "CPU" -> "CPU"
      else -> "GPU"
    }

  private fun backendConfig(backend: String): Any =
    when (backend.uppercase()) {
      "CPU" -> Class.forName("com.google.ai.edge.litertlm.Backend\$CPU").getConstructor().newInstance()
      else -> Class.forName("com.google.ai.edge.litertlm.Backend\$GPU").getConstructor().newInstance()
    }

  private fun createEngine(modelPath: String, backend: String, maxTokens: Int): Any {
    val backendClass = Class.forName("com.google.ai.edge.litertlm.Backend")
    val engineConfigClass = Class.forName("com.google.ai.edge.litertlm.EngineConfig")
    val engineClass = Class.forName("com.google.ai.edge.litertlm.Engine")
    val config = engineConfigClass
      .getConstructor(
        String::class.java,
        backendClass,
        backendClass,
        backendClass,
        Integer::class.java,
        Integer::class.java,
        String::class.java,
      )
      .newInstance(
        modelPath,
        backendConfig(backend),
        null,
        null,
        Integer.valueOf(maxTokens),
        null,
        reactContext.cacheDir.absolutePath,
      )
    return engineClass.getConstructor(engineConfigClass).newInstance(config)
  }

  private fun closeEngine() {
    engine?.let { current ->
      runCatching { current.javaClass.getMethod("close").invoke(current) }
    }
  }

  private fun createSession(currentEngine: Any): AutoCloseable {
    val sessionConfigClass = Class.forName("com.google.ai.edge.litertlm.SessionConfig")
    val samplerConfigClass = Class.forName("com.google.ai.edge.litertlm.SamplerConfig")
    val samplerConfig = samplerConfigClass
      .getConstructor(
        Integer.TYPE,
        java.lang.Double.TYPE,
        java.lang.Double.TYPE,
        Integer.TYPE,
      )
      .newInstance(1, 1.0, 0.0, 1)
    val config = sessionConfigClass.getConstructor(samplerConfigClass).newInstance(samplerConfig)
    return currentEngine.javaClass
      .getMethod("createSession", sessionConfigClass)
      .invoke(currentEngine, config) as AutoCloseable
  }

  private fun generateContentStream(session: AutoCloseable, prompt: String): String {
    val inputTextClass = Class.forName("com.google.ai.edge.litertlm.InputData\$Text")
    val callbackClass = Class.forName("com.google.ai.edge.litertlm.ResponseCallback")
    val input = inputTextClass.getConstructor(String::class.java).newInstance(prompt)
    val inputs = listOf(input)
    val text = StringBuilder()
    val finalJson = AtomicReference<String?>(null)
    val error = AtomicReference<Throwable?>(null)
    val done = CountDownLatch(1)
    var tokenCount = 0
    val callback = Proxy.newProxyInstance(
      callbackClass.classLoader,
      arrayOf(callbackClass)
    ) { _, method, args ->
      when (method.name) {
        "onNext" -> {
          text.append(args?.firstOrNull() as? String ?: "")
          tokenCount += 1
          val parsed = parseCompleteJson(text)
          if (parsed != null) {
            finalJson.set(parsed)
            runCatching { session.javaClass.getMethod("cancelProcess").invoke(session) }
            done.countDown()
          } else if (tokenCount >= MAX_RESPONSE_TOKENS) {
            runCatching { session.javaClass.getMethod("cancelProcess").invoke(session) }
            done.countDown()
          }
        }
        "onDone" -> done.countDown()
        "onError" -> {
          error.set(args?.firstOrNull() as? Throwable ?: IllegalStateException("LiteRT-LM stream failed."))
          done.countDown()
        }
      }
      null
    }
    session.javaClass
      .getMethod("generateContentStream", List::class.java, callbackClass)
      .invoke(session, inputs, callback)
    if (!done.await(120, TimeUnit.SECONDS)) {
      runCatching { session.javaClass.getMethod("cancelProcess").invoke(session) }
      throw IllegalStateException("LiteRT-LM generation timed out before producing clinical JSON.")
    }
    finalJson.get()?.let { return it }
    error.get()?.let { throw it }
    throw IllegalStateException(
      "LiteRT-LM stopped before producing valid clinical JSON after $tokenCount chunks. Output preview: ${preview(text)}"
    )
  }

  private fun deviceMemoryInfo(): ActivityManager.MemoryInfo {
    val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return ActivityManager.MemoryInfo().also { activityManager.getMemoryInfo(it) }
  }

  private fun formatGb(bytes: Long): String = "%.1f GB".format(bytes.toDouble() / 1_073_741_824.0)

  private fun preview(text: CharSequence): String =
    text.take(600).toString().replace(Regex("\\s+"), " ").trim()

  private fun parseCompleteJson(text: CharSequence): String? {
    val start = text.indexOf('{')
    if (start < 0) return null
    var depth = 0
    var inString = false
    var escaped = false
    for (index in start until text.length) {
      val char = text[index]
      if (escaped) {
        escaped = false
        continue
      }
      if (char == '\\' && inString) {
        escaped = true
        continue
      }
      if (char == '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (char == '{') depth += 1
      if (char == '}') {
        depth -= 1
        if (depth == 0) {
          val candidate = text.subSequence(start, index + 1).toString()
          return runCatching {
            JSONObject(candidate)
            candidate
          }.getOrNull()
        }
      }
    }
    return null
  }

  companion object {
    const val NAME = "ShifaLiteRT"
    private const val MAX_RESPONSE_TOKENS = 512
    private const val MIN_RECOMMENDED_RAM_BYTES = 5_905_580_032L
  }
}
