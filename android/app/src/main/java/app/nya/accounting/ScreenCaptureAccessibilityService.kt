package app.nya.accounting

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.hardware.HardwareBuffer
import android.os.Build
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import java.io.File
import java.io.FileOutputStream

class ScreenCaptureAccessibilityService : AccessibilityService() {
  @Volatile
  private var capturing = false

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onDestroy() {
    if (instance === this) {
      instance = null
    }
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // The service only uses the screenshot capability; no window content is read.
  }

  override fun onInterrupt() = Unit

  fun captureCurrentScreen() {
    if (capturing) {
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      deliverError("当前 Android 版本不支持直接截取页面。")
      return
    }

    capturing = true
    takeScreenshot(
      Display.DEFAULT_DISPLAY,
      mainExecutor,
      object : TakeScreenshotCallback {
        override fun onSuccess(screenshot: ScreenshotResult) {
          try {
            saveScreenshot(screenshot)
          } catch (error: Exception) {
            deliverError(error.message ?: "无法保存当前页面截图。")
          } finally {
            capturing = false
          }
        }

        override fun onFailure(errorCode: Int) {
          capturing = false
          deliverError("系统截图失败（错误码 $errorCode），请重试。")
        }
      },
    )
  }

  private fun saveScreenshot(screenshot: ScreenshotResult) {
    val hardwareBuffer: HardwareBuffer = screenshot.hardwareBuffer
    val hardwareBitmap = try {
      Bitmap.wrapHardwareBuffer(hardwareBuffer, screenshot.colorSpace)
    } finally {
      hardwareBuffer.close()
    }
    val bitmap = hardwareBitmap?.copy(Bitmap.Config.ARGB_8888, false)
      ?: throw IllegalStateException("系统没有返回有效截图。")
    hardwareBitmap.recycle()

    val file = File(cacheDir, "current-screen-${System.currentTimeMillis()}.png")
    try {
      FileOutputStream(file).use { output ->
        if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
          throw IllegalStateException("截图压缩失败。")
        }
      }
    } finally {
      bitmap.recycle()
    }

    ScreenCaptureStore.savePendingUri(this, file.toURI().toString())
    launchMainActivity()
  }

  private fun deliverError(message: String) {
    ScreenCaptureStore.savePendingError(this, message)
    launchMainActivity()
  }

  private fun launchMainActivity() {
    startActivity(
      android.content.Intent(this, MainActivity::class.java).apply {
        addFlags(
          android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
            android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or
            android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
      },
    )
  }

  companion object {
    @Volatile
    var instance: ScreenCaptureAccessibilityService? = null

    fun isRunning(): Boolean = instance != null
  }
}
