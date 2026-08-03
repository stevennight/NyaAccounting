package app.nya.accounting

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Arguments
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
  fun isOverlayPermissionGranted(promise: Promise) {
    promise.resolve(Settings.canDrawOverlays(reactContext))
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      reactContext.startActivity(
        Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${reactContext.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("overlay_settings_unavailable", error.message, error)
    }
  }

  @ReactMethod
  fun isOverlayRunning(promise: Promise) {
    promise.resolve(ScreenCaptureOverlayService.isRunning)
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    if (!Settings.canDrawOverlays(reactContext)) {
      promise.resolve(false)
      return
    }
    if (!ScreenCaptureNotification.show(reactContext)) {
      promise.resolve(false)
      return
    }
    ScreenCaptureOverlayService.start(reactContext)
    promise.resolve(true)
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    ScreenCaptureOverlayService.stop(reactContext)
    ScreenCaptureNotification.refresh(reactContext)
    promise.resolve(true)
  }

  @ReactMethod
  fun pendingScreenshotCount(promise: Promise) {
    promise.resolve(ScreenCaptureStore.pendingUriCount(reactContext))
  }

  @ReactMethod
  fun consumePendingScreenshots(promise: Promise) {
    val result = Arguments.createArray()
    ScreenCaptureStore.consumePendingUris(reactContext).forEach(result::pushString)
    ScreenCaptureNotification.refresh(reactContext)
    promise.resolve(result)
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
