package app.nya.accounting

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenCaptureModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "NyaScreenCapture"

  @ReactMethod
  fun isAccessibilityEnabled(promise: Promise) {
    promise.resolve(ScreenCaptureAccessibilityService.isRunning())
  }

  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) {
    try {
      reactContext.startActivity(
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("settings_unavailable", error.message, error)
    }
  }

  @ReactMethod
  fun showCaptureNotification(promise: Promise) {
    try {
      promise.resolve(ScreenCaptureNotification.show(reactContext))
    } catch (error: Exception) {
      promise.reject("notification_unavailable", error.message, error)
    }
  }

  @ReactMethod
  fun hideCaptureNotification(promise: Promise) {
    ScreenCaptureNotification.hide(reactContext)
    promise.resolve(true)
  }

  @ReactMethod
  fun consumePendingScreenshot(promise: Promise) {
    promise.resolve(ScreenCaptureStore.consumePendingUri(reactContext))
  }

  @ReactMethod
  fun consumePendingError(promise: Promise) {
    promise.resolve(ScreenCaptureStore.consumePendingError(reactContext))
  }
}
