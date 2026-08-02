package app.nya.accounting

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScreenCaptureActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ScreenCaptureNotification.ACTION_CAPTURE) {
      return
    }
    val service = ScreenCaptureAccessibilityService.instance
    if (service == null) {
      ScreenCaptureStore.savePendingError(
        context,
        "请先在系统无障碍设置中启用 Nya 记账的当前页面截图服务。",
      )
      context.startActivity(
        Intent(context, MainActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        },
      )
      return
    }
    service.captureCurrentScreen()
  }
}
