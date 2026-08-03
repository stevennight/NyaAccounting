package app.nya.accounting

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

object ScreenCaptureNotification {
  const val CHANNEL_ID = "screen_capture"
  const val NOTIFICATION_ID = 24082
  const val ACTION_CAPTURE = "app.nya.accounting.CAPTURE_CURRENT_SCREEN"
  const val ACTION_OPEN_QUEUE = "app.nya.accounting.OPEN_PENDING_SCREENSHOTS"
  const val ACTION_START_OVERLAY = "app.nya.accounting.START_SCREEN_CAPTURE_OVERLAY"
  const val ACTION_STOP_OVERLAY = "app.nya.accounting.STOP_SCREEN_CAPTURE_OVERLAY"

  fun show(context: Context): Boolean {
    if (!hasNotificationPermission(context)) {
      return false
    }
    refresh(context)
    return true
  }

  fun refresh(context: Context): Boolean {
    if (!hasNotificationPermission(context)) {
      return false
    }
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.notify(NOTIFICATION_ID, build(context))
    return true
  }

  fun build(context: Context): Notification {
    ensureChannel(context)
    val pendingCount = ScreenCaptureStore.pendingUriCount(context)
    val overlayRunning = ScreenCaptureOverlayService.isRunning
    val contentText = when {
      pendingCount > 0 -> "已收集 $pendingCount 张截图，点击“打开待录账单”"
      overlayRunning -> "悬浮球已开启，点击悬浮球截图"
      else -> "在支付宝等页面点击“截图记账”"
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }
    return builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Nya 记账")
      .setContentText(contentText)
      .setContentIntent(actionIntent(context, ACTION_OPEN_QUEUE, 24083))
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(
        Notification.Action.Builder(
          null,
          "截图记账",
          actionIntent(context, ACTION_CAPTURE, 24082),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          null,
          "打开待录账单",
          actionIntent(context, ACTION_OPEN_QUEUE, 24083),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          null,
          if (overlayRunning) "关闭悬浮球" else "开启悬浮球",
          actionIntent(
            context,
            if (overlayRunning) ACTION_STOP_OVERLAY else ACTION_START_OVERLAY,
            24084,
          ),
        ).build(),
      )
      .build()
  }

  fun hide(context: Context) {
    context.stopService(Intent(context, ScreenCaptureOverlayService::class.java))
    context.getSystemService(NotificationManager::class.java)
      .cancel(NOTIFICATION_ID)
  }

  private fun actionIntent(context: Context, action: String, requestCode: Int): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      requestCode,
      Intent(context, ScreenCaptureActionReceiver::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "当前页面截图",
          NotificationManager.IMPORTANCE_LOW,
        ).apply {
          description = "从通知栏或悬浮球截取当前页面并进入 Nya 记账识别"
          setShowBadge(false)
        },
      )
    }
  }

  private fun hasNotificationPermission(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
}
