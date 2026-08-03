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
    ScreenCaptureOverlayService.instance?.requestCapture()
      ?: ScreenCaptureAccessibilityService.instance?.captureCurrentScreen()
      ?: run {
        ScreenCaptureStore.savePendingError(
          context,
          "请先在系统无障碍设置中启用 Nya 记账的当前页面截图服务。",
        )
        openMainActivity(context)
      }
  }

  private fun startOverlay(context: Context) {
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
    ScreenCaptureOverlayService.stop(context)
    ScreenCaptureNotification.refresh(context)
    context.startActivity(
      Intent(context, MainActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
      },
    )
  }
}
