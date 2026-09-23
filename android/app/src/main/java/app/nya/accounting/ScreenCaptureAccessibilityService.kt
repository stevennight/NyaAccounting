package app.nya.accounting

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.hardware.HardwareBuffer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.content.Intent
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ScreenCaptureAccessibilityService : AccessibilityService() {
  @Volatile
  private var capturing = false
  private val mainHandler = Handler(Looper.getMainLooper())
  // ScreenshotResult contains a hardware buffer and converting/compressing it
  // can take hundreds of milliseconds on a large display. Keep that work off
  // the accessibility service's main thread so Android does not treat a slow
  // capture as a hung service.
  private val captureExecutor: ExecutorService = Executors.newSingleThreadExecutor()

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onDestroy() {
    mainHandler.removeCallbacksAndMessages(null)
    captureExecutor.shutdownNow()
    capturing = false
    if (instance === this) {
      instance = null
    }
    super.onDestroy()
  }

  override fun onUnbind(intent: Intent?): Boolean {
    capturing = false
    if (instance === this) {
      instance = null
    }
    return super.onUnbind(intent)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // The service only uses the screenshot capability; no window content is read.
  }

  override fun onInterrupt() = Unit

  fun captureCurrentScreen(onFinished: (() -> Unit)? = null): Boolean {
    if (capturing) {
      return false
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      deliverError("当前 Android 版本不支持直接截取页面。")
      onFinished?.invoke()
      return false
    }

    capturing = true
    dismissNotificationShadeForAction()
    // The notification shade closes with an animation. Capture after it has
    // settled so the system panel is not included in the bitmap.
    mainHandler.postDelayed({ requestScreenshot(onFinished, 0) }, SCREENSHOT_DELAY_MILLIS)
    return true
  }

  private fun requestScreenshot(onFinished: (() -> Unit)?, attempt: Int) {
    if (!capturing || instance !== this) {
      onFinished?.invoke()
      return
    }
    try {
      takeScreenshot(
        Display.DEFAULT_DISPLAY,
        captureExecutor,
        object : TakeScreenshotCallback {
          override fun onSuccess(screenshot: ScreenshotResult) {
            try {
              saveScreenshot(screenshot)
            } catch (error: Exception) {
              deliverError(error.message ?: "无法保存当前页面截图。")
            } finally {
              capturing = false
              onFinished?.invoke()
            }
          }

          override fun onFailure(errorCode: Int) {
            if (attempt < MAX_SCREENSHOT_RETRIES && isRetryableScreenshotError(errorCode)) {
              mainHandler.postDelayed(
                { requestScreenshot(onFinished, attempt + 1) },
                RETRY_DELAY_MILLIS,
              )
              return
            }
            capturing = false
            deliverError("系统截图失败（错误码 $errorCode），请重试。")
            onFinished?.invoke()
          }
        },
      )
    } catch (error: Exception) {
      if (attempt < MAX_SCREENSHOT_RETRIES) {
        mainHandler.postDelayed(
          { requestScreenshot(onFinished, attempt + 1) },
          RETRY_DELAY_MILLIS,
        )
      } else {
        capturing = false
        deliverError(error.message ?: "系统截图暂时不可用，请重试。")
        onFinished?.invoke()
      }
    }
  }

  private fun isRetryableScreenshotError(errorCode: Int): Boolean =
    errorCode == ERROR_TAKE_SCREENSHOT_INTERNAL_ERROR ||
      errorCode == ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS ||
      errorCode == ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT

  fun dismissNotificationShadeForAction() {
    // This global action is available before Android 12 as well. Calling it
    // on Android 11 avoids falling back to the less reliable broadcast path.
    val dismissed = runCatching {
      performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
    }.getOrDefault(false)
    if (!dismissed) {
      runCatching {
        sendBroadcast(Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS))
      }
    }
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

    val captureDirectory = File(filesDir, "screen-captures").apply {
      if (!exists() && !mkdirs()) {
        throw IllegalStateException("无法创建截图存储目录。")
      }
    }
    val file = File(captureDirectory, "current-screen-${System.currentTimeMillis()}.png")
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
    showCaptureSuccessToast()
    ScreenCaptureNotification.refresh(this)
  }

  private fun deliverError(message: String) {
    ScreenCaptureStore.savePendingError(this, message)
    ScreenCaptureNotification.refresh(this)
  }

  private fun showCaptureSuccessToast() {
    mainHandler.post {
      Toast.makeText(this, "截图已完成", Toast.LENGTH_SHORT).show()
    }
  }

  companion object {
    private const val SCREENSHOT_DELAY_MILLIS = 650L
    private const val RETRY_DELAY_MILLIS = 400L
    private const val MAX_SCREENSHOT_RETRIES = 2

    @Volatile
    var instance: ScreenCaptureAccessibilityService? = null

    fun isRunning(): Boolean = instance != null
  }
}
