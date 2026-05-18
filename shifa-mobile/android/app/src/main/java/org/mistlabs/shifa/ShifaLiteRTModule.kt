package org.mistlabs.shifa

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.Collections

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
        promise.reject("SHIFA_LITERT_INIT_FAILED", error.message, error)
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
      try {
        val conversation = createConversation(currentEngine)
        val response = sendMessage(conversation, prompt)
        promise.resolve(messageText(response))
        conversation.close()
      } catch (error: Throwable) {
        promise.reject("SHIFA_LITERT_GENERATE_FAILED", error.message, error)
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
        promise.reject("SHIFA_LITERT_TOKENIZE_FAILED", error.message, error)
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
  fun close(promise: Promise) {
    try {
      closeEngine()
      engine = null
      activeModelPath = null
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("SHIFA_LITERT_CLOSE_FAILED", error.message, error)
    }
  }

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

  private fun createConversation(currentEngine: Any): AutoCloseable {
    val conversationConfigClass = Class.forName("com.google.ai.edge.litertlm.ConversationConfig")
    val config = conversationConfigClass.getConstructor().newInstance()
    return currentEngine.javaClass
      .getMethod("createConversation", conversationConfigClass)
      .invoke(currentEngine, config) as AutoCloseable
  }

  private fun sendMessage(conversation: AutoCloseable, prompt: String): Any =
    conversation.javaClass
      .getMethod("sendMessage", String::class.java, Map::class.java)
      .invoke(conversation, prompt, Collections.emptyMap<String, Any>())
      ?: throw IllegalStateException("LiteRT-LM returned an empty response.")

  @Suppress("UNCHECKED_CAST")
  private fun messageText(message: Any): String {
    val contents = message.javaClass.getMethod("getContents").invoke(message)
    val contentItems = contents.javaClass.getMethod("getContents").invoke(contents) as List<Any>
    return contentItems.joinToString(separator = "") { item ->
      runCatching { item.javaClass.getMethod("getText").invoke(item) as? String }
        .getOrNull()
        .orEmpty()
    }
  }

  companion object {
    const val NAME = "ShifaLiteRT"
  }
}
