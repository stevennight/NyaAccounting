package app.nya.accounting

import android.content.Context

object ScreenCaptureStore {
  private const val PREFS = "nya_screen_capture"
  private const val PENDING_URI = "pending_uri"
  private const val PENDING_ERROR = "pending_error"

  fun savePendingUri(context: Context, uri: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(PENDING_URI, uri)
      .remove(PENDING_ERROR)
      .apply()
  }

  fun consumePendingUri(context: Context): String? {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val value = preferences.getString(PENDING_URI, null)
    preferences.edit().remove(PENDING_URI).apply()
    return value
  }

  fun savePendingError(context: Context, message: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(PENDING_ERROR, message)
      .apply()
  }

  fun consumePendingError(context: Context): String? {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val value = preferences.getString(PENDING_ERROR, null)
    preferences.edit().remove(PENDING_ERROR).apply()
    return value
  }
}
