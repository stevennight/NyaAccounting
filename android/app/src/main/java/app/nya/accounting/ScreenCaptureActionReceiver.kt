package app.nya.accounting

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

class ScreenCaptureActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      ScreenCaptureNotification.ACTION_CAPTURE -> capture(context)
      ScreenCaptureNotification.ACTION_OPEN_QUEUE -> openMainActivity(context)
      ScreenCaptureNotification.ACTION_START_OVERLAY -> startOverlay(context)
      ScreenCaptureNotification.ACTION_STOP_OVERLAY -> {
        ScreenCaptureOverlayService.stop(context)
        ScreenCaptureNotification.refresh(context)
      }
    }
  }

  private fun capture(context: Context) {
    val service = ScreenCaptureAccessibilityService.instance
    if (service == null) {
      ScreenCaptureStore.savePendingError(
        context,
        if (ScreenCaptureAccessibilityService.isEnabledInSettings(context)) {
          "无障碍截图服务已开启但没有运行（系统显示“不工作”或“出现故障”）。请在无障碍设置中把 Nya 记账关闭后重新开启。"
        } else {
          "无障碍截图服务已被关闭，请在系统无障碍设置中重新启用 Nya 记账。"
        },
      )
      openMainActivity(context)
      return
    }
    // Hide the floating bubble (if any) so it is not part of the screenshot.
    ScreenCaptureOverlayService.instance?.let { overlay ->
      overlay.requestCapture(openAppAfterCapture = true)
      return
    }
    service.captureCurrentScreen(openAppAfterCapture = true)
  }

  private fun startOverlay(context: Context) {
    dismissNotificationShade(context)
    if (!Settings.canDrawOverlays(context)) {
      ScreenCaptureStore.savePendingError(
        context,
        "请先允许 Nya 记账显示在其他应用上层，才能开启悬浮球。",
      )
      runCatching {
        context.startActivity(
          Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}"),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
      return
    }
    ScreenCaptureOverlayService.start(context)
  }

  private fun openMainActivity(context: Context) {
    dismissNotificationShade(context)
    ScreenCaptureNotification.openApp(context)
  }

  private fun dismissNotificationShade(context: Context) {
    ScreenCaptureAccessibilityService.instance?.dismissNotificationShadeForAction()
      ?: runCatching {
        context.sendBroadcast(Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS))
      }
  }
}
