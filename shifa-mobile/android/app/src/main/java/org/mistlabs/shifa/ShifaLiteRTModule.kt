package org.mistlabs.shifa

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.io.File

class ShifaLiteRTModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var llmInference: LlmInference? = null
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

        llmInference?.close()
        val preferredBackend = when (backend.uppercase()) {
          "CPU" -> LlmInference.Backend.CPU
          else -> LlmInference.Backend.GPU
        }
        val options = LlmInference.LlmInferenceOptions.builder()
          .setModelPath(file.absolutePath)
          .setMaxTokens(maxTokens.coerceAtLeast(128))
          .setPreferredBackend(preferredBackend)
          .build()

        llmInference = LlmInference.createFromOptions(reactContext, options)
        activeModelPath = file.absolutePath
        activeBackend = preferredBackend.name
        promise.resolve(runtimeInfo())
      } catch (error: Throwable) {
        promise.reject("SHIFA_LITERT_INIT_FAILED", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun generate(prompt: String, promise: Promise) {
    val engine = llmInference
    if (engine == null) {
      promise.reject("SHIFA_LITERT_NOT_READY", "LiteRT engine has not been initialized.")
      return
    }

    Thread {
      try {
        promise.resolve(engine.generateResponse(prompt))
      } catch (error: Throwable) {
        promise.reject("SHIFA_LITERT_GENERATE_FAILED", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun sizeInTokens(text: String, promise: Promise) {
    val engine = llmInference
    if (engine == null) {
      promise.reject("SHIFA_LITERT_NOT_READY", "LiteRT engine has not been initialized.")
      return
    }

    Thread {
      try {
        promise.resolve(engine.sizeInTokens(text))
      } catch (error: Throwable) {
        promise.reject("SHIFA_LITERT_TOKENIZE_FAILED", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun isReady(promise: Promise) {
    promise.resolve(llmInference != null)
  }

  @ReactMethod
  fun getRuntimeInfo(promise: Promise) {
    promise.resolve(runtimeInfo())
  }

  @ReactMethod
  fun close(promise: Promise) {
    try {
      llmInference?.close()
      llmInference = null
      activeModelPath = null
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("SHIFA_LITERT_CLOSE_FAILED", error.message, error)
    }
  }

  private fun runtimeInfo(): Map<String, Any?> =
    mapOf(
      "ready" to (llmInference != null),
      "modelPath" to activeModelPath,
      "backend" to activeBackend,
    )

  companion object {
    const val NAME = "ShifaLiteRT"
  }
}
