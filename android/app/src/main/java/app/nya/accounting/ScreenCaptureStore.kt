package app.nya.accounting

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray

object ScreenCaptureStore {
  private const val PREFS = "nya_screen_capture"
  private const val PENDING_URIS = "pending_uris"
  private const val LEGACY_PENDING_URI = "pending_uri"
  private const val PENDING_ERROR = "pending_error"
  private const val MAX_PENDING_URIS = 50

  @Synchronized
  fun savePendingUri(context: Context, uri: String) {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val uris = readPendingUris(preferences).toMutableList()
    if (!uris.contains(uri)) {
      if (uris.size >= MAX_PENDING_URIS) {
        uris.removeAt(0)
      }
      uris.add(uri)
    }
    preferences.edit()
      .putString(PENDING_URIS, JSONArray(uris).toString())
      .remove(LEGACY_PENDING_URI)
      .apply()
  }

  @Synchronized
  fun consumePendingUris(context: Context): List<String> {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val values = readPendingUris(preferences)
    preferences.edit()
      .remove(PENDING_URIS)
      .remove(LEGACY_PENDING_URI)
      .apply()
    return values
  }

  @Synchronized
  fun consumePendingUri(context: Context): String? =
    consumePendingUris(context).firstOrNull()

  @Synchronized
  fun pendingUriCount(context: Context): Int =
    readPendingUris(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)).size

  @Synchronized
  fun savePendingError(context: Context, message: String) {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val previous = preferences.getString(PENDING_ERROR, null)
    val combined = listOfNotNull(previous, message.trim())
      .filter { it.isNotBlank() }
      .joinToString("\n")
      .takeLast(2_000)
    preferences.edit()
      .putString(PENDING_ERROR, combined)
      .apply()
  }

  @Synchronized
  fun consumePendingError(context: Context): String? {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val value = preferences.getString(PENDING_ERROR, null)
    preferences.edit().remove(PENDING_ERROR).apply()
    return value
  }

  private fun readPendingUris(preferences: SharedPreferences): List<String> {
    val encoded = preferences.getString(PENDING_URIS, null)
    if (!encoded.isNullOrBlank()) {
      return runCatching {
        val array = JSONArray(encoded)
        buildList(array.length()) {
          for (index in 0 until array.length()) {
            array.optString(index).takeIf { it.isNotBlank() }?.let(::add)
          }
        }
      }.getOrDefault(emptyList())
    }
    return preferences.getString(LEGACY_PENDING_URI, null)
      ?.takeIf { it.isNotBlank() }
      ?.let(::listOf)
      ?: emptyList()
  }
}
