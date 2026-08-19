package app.nya.accounting

import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppUpdateModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "NyaAppUpdate"

  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    try {
      promise.resolve(
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
          reactContext.packageManager.canRequestPackageInstalls(),
      )
    } catch (error: Exception) {
      promise.reject("install_permission_check_failed", error.message, error)
    }
  }
}
