package org.mistlabs.shifa

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

class ShifaGuardDetectorModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun detect(imageUri: String, modelPath: String, minConfidence: Double, iouThreshold: Double, promise: Promise) {
    Thread {
      try {
        val modelFile = File(modelPath)
        if (!modelFile.exists() || !modelFile.canRead()) {
          promise.reject("SHIFA_GUARD_MODEL_MISSING", "Guard detector model is not readable: $modelPath")
          return@Thread
        }

        val bitmap = loadBitmap(imageUri)
        if (bitmap == null) {
          promise.reject("SHIFA_GUARD_IMAGE_UNREADABLE", "Guard evidence image is not readable: $imageUri")
          return@Thread
        }

        Interpreter(modelFile).use { interpreter ->
          val inputTensor = interpreter.getInputTensor(0)
          val inputShape = inputTensor.shape()
          val channelsLast = inputShape.size >= 4 && inputShape[3] == 3
          val channelsFirst = inputShape.size >= 4 && inputShape[1] == 3
          val inputHeight = if (channelsFirst) inputShape[2] else inputShape.getOrNull(1) ?: 640
          val inputWidth = if (channelsFirst) inputShape[3] else inputShape.getOrNull(2) ?: 640
          val resized = Bitmap.createScaledBitmap(bitmap, inputWidth, inputHeight, true)
          val input = buildInputBuffer(resized, inputTensor.dataType(), inputTensor.quantizationParams(), channelsLast)

          val outputTensor = interpreter.getOutputTensor(0)
          val outputShape = outputTensor.shape()
          val outputBuffer = ByteBuffer.allocateDirect(outputTensor.numBytes()).order(ByteOrder.nativeOrder())
          interpreter.run(input, outputBuffer)

          val values = tensorValues(outputBuffer, outputTensor.dataType(), outputTensor.quantizationParams())
          val detections = decodeYolo(values, outputShape, minConfidence.toFloat(), iouThreshold.toFloat())
          val result = Arguments.createMap()
          val detectionArray = Arguments.createArray()
          detections.forEach { detection ->
            val item = Arguments.createMap()
            item.putString("className", detection.className)
            item.putDouble("confidence", detection.confidence.toDouble())
            val box = Arguments.createMap()
            box.putDouble("x", detection.x.toDouble())
            box.putDouble("y", detection.y.toDouble())
            box.putDouble("width", detection.width.toDouble())
            box.putDouble("height", detection.height.toDouble())
            item.putMap("box", box)
            detectionArray.pushMap(item)
          }
          result.putArray("detections", detectionArray)
          result.putBoolean("threatDetected", detections.any { it.className == "GUN" })
          promise.resolve(result)
        }
      } catch (error: Throwable) {
        promise.reject("SHIFA_GUARD_DETECT_FAILED", error.message, error)
      }
    }.start()
  }

  private fun loadBitmap(imageUri: String): Bitmap? {
    val uri = Uri.parse(imageUri)
    return reactContext.contentResolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream)
    }
  }

  private fun buildInputBuffer(
    bitmap: Bitmap,
    dataType: DataType,
    quantization: org.tensorflow.lite.Tensor.QuantizationParams,
    channelsLast: Boolean
  ): ByteBuffer {
    val bytesPerValue = when (dataType) {
      DataType.FLOAT32 -> 4
      DataType.UINT8, DataType.INT8 -> 1
      else -> throw IllegalArgumentException("Unsupported Guard input tensor type: $dataType")
    }
    val buffer = ByteBuffer.allocateDirect(1 * bitmap.width * bitmap.height * 3 * bytesPerValue).order(ByteOrder.nativeOrder())
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)

    if (channelsLast) {
      for (pixel in pixels) {
        putPixelValue(buffer, dataType, quantization, (pixel shr 16) and 0xFF)
        putPixelValue(buffer, dataType, quantization, (pixel shr 8) and 0xFF)
        putPixelValue(buffer, dataType, quantization, pixel and 0xFF)
      }
    } else {
      for (channel in 0 until 3) {
        for (pixel in pixels) {
          val value = when (channel) {
            0 -> (pixel shr 16) and 0xFF
            1 -> (pixel shr 8) and 0xFF
            else -> pixel and 0xFF
          }
          putPixelValue(buffer, dataType, quantization, value)
        }
      }
    }
    buffer.rewind()
    return buffer
  }

  private fun putPixelValue(
    buffer: ByteBuffer,
    dataType: DataType,
    quantization: org.tensorflow.lite.Tensor.QuantizationParams,
    value: Int
  ) {
    when (dataType) {
      DataType.FLOAT32 -> buffer.putFloat(value / 255.0f)
      DataType.UINT8 -> {
        val quantized = if (quantization.scale > 0f) (value / 255.0f / quantization.scale + quantization.zeroPoint).toInt() else value
        buffer.put(quantized.coerceIn(0, 255).toByte())
      }
      DataType.INT8 -> {
        val quantized = if (quantization.scale > 0f) (value / 255.0f / quantization.scale + quantization.zeroPoint).toInt() else value - 128
        buffer.put(quantized.coerceIn(-128, 127).toByte())
      }
      else -> throw IllegalArgumentException("Unsupported Guard input tensor type: $dataType")
    }
  }

  private fun tensorValues(
    buffer: ByteBuffer,
    dataType: DataType,
    quantization: org.tensorflow.lite.Tensor.QuantizationParams
  ): FloatArray {
    buffer.rewind()
    return when (dataType) {
      DataType.FLOAT32 -> FloatArray(buffer.capacity() / 4) { buffer.getFloat() }
      DataType.UINT8 -> FloatArray(buffer.capacity()) {
        val raw = buffer.get().toInt() and 0xFF
        if (quantization.scale > 0f) (raw - quantization.zeroPoint) * quantization.scale else raw.toFloat()
      }
      DataType.INT8 -> FloatArray(buffer.capacity()) {
        val raw = buffer.get().toInt()
        if (quantization.scale > 0f) (raw - quantization.zeroPoint) * quantization.scale else raw.toFloat()
      }
      else -> throw IllegalArgumentException("Unsupported Guard output tensor type: $dataType")
    }
  }

  private fun decodeYolo(values: FloatArray, shape: IntArray, minConfidence: Float, iouThreshold: Float): List<Detection> {
    if (shape.size < 3) return emptyList()
    val dimA = shape[1]
    val dimB = shape[2]
    val classes = CLASS_NAMES.size
    val valuesPerDetection = 4 + classes
    val detectionCount: Int
    val channelsFirst: Boolean
    if (dimA == valuesPerDetection) {
      channelsFirst = true
      detectionCount = dimB
    } else if (dimB == valuesPerDetection) {
      channelsFirst = false
      detectionCount = dimA
    } else {
      return emptyList()
    }

    val raw = mutableListOf<Detection>()
    for (idx in 0 until detectionCount) {
      fun value(channel: Int): Float =
        if (channelsFirst) values[channel * detectionCount + idx] else values[idx * valuesPerDetection + channel]

      val xCenter = value(0)
      val yCenter = value(1)
      val boxWidth = value(2)
      val boxHeight = value(3)
      var bestClass = 0
      var bestScore = 0f
      for (classIdx in 0 until classes) {
        val score = value(4 + classIdx)
        if (score > bestScore) {
          bestScore = score
          bestClass = classIdx
        }
      }
      if (bestScore < minConfidence) continue

      val scale = max(max(xCenter, yCenter), max(boxWidth, boxHeight))
      val normalizedX = if (scale > 2f) xCenter / 640f else xCenter
      val normalizedY = if (scale > 2f) yCenter / 640f else yCenter
      val normalizedW = if (scale > 2f) boxWidth / 640f else boxWidth
      val normalizedH = if (scale > 2f) boxHeight / 640f else boxHeight
      val left = (normalizedX - normalizedW / 2f).coerceIn(0f, 1f)
      val top = (normalizedY - normalizedH / 2f).coerceIn(0f, 1f)
      val right = (normalizedX + normalizedW / 2f).coerceIn(0f, 1f)
      val bottom = (normalizedY + normalizedH / 2f).coerceIn(0f, 1f)
      val width = right - left
      val height = bottom - top
      if (width <= 0f || height <= 0f) continue
      raw += Detection(CLASS_NAMES[bestClass], bestScore, left, top, width, height)
    }
    return nonMaxSuppression(raw.sortedByDescending { it.confidence }, iouThreshold).take(MAX_DETECTIONS)
  }

  private fun nonMaxSuppression(detections: List<Detection>, iouThreshold: Float): List<Detection> {
    val selected = mutableListOf<Detection>()
    detections.forEach { candidate ->
      val overlaps = selected.any { it.className == candidate.className && iou(it, candidate) > iouThreshold }
      if (!overlaps) selected += candidate
    }
    return selected
  }

  private fun iou(a: Detection, b: Detection): Float {
    val x1 = max(a.x, b.x)
    val y1 = max(a.y, b.y)
    val x2 = min(a.x + a.width, b.x + b.width)
    val y2 = min(a.y + a.height, b.y + b.height)
    val intersection = max(0f, x2 - x1) * max(0f, y2 - y1)
    val union = a.width * a.height + b.width * b.height - intersection
    return if (union <= 0f) 0f else intersection / union
  }

  private data class Detection(
    val className: String,
    val confidence: Float,
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
  )

  companion object {
    const val NAME = "ShifaGuardDetector"
    private val CLASS_NAMES = listOf("GUN", "KNIFE", "PERSON")
    private const val MAX_DETECTIONS = 20
  }
}
