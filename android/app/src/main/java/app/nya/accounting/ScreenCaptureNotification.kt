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
    ScreenCaptureStore.setNotificationEnabled(context, true)
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

  /** Re-posts the notification the user turned on earlier (e.g. after a reboot). */
  fun restoreIfEnabled(context: Context) {
    if (ScreenCaptureStore.isNotificationEnabled(context)) {
      runCatching { refresh(context) }
    }
  }

  fun build(context: Context): Notification {
    ensureChannel(context)
    val pendingCount = ScreenCaptureStore.pendingUriCount(context)
    val overlayRunning = ScreenCaptureOverlayService.isRunning
    val contentText = when {
      pendingCount > 0 -> "悬浮球已收集 $pendingCount 张截图，点这里开始录入"
      overlayRunning -> "悬浮球已开启：连续截图，完成后回到这里录入"
      else -> "在支付宝等页面点“截图记账”，截图后直接打开识别"
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }
    builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Nya 记账")
      .setContentText(contentText)
      .setContentIntent(actionIntent(context, ACTION_OPEN_QUEUE, 24083))
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      // Single shot: capture the current page, then open the app to review it.
      // Collecting several screenshots in a row is the floating bubble's job.
      .addAction(
        Notification.Action.Builder(
          null,
          "截图记账",
          actionIntent(context, ACTION_CAPTURE, 24082),
        ).build(),
      )
    if (pendingCount > 0) {
      builder.addAction(
        Notification.Action.Builder(
          null,
          "录入 $pendingCount 张",
          actionIntent(context, ACTION_OPEN_QUEUE, 24083),
        ).build(),
      )
    }
    builder.addAction(
      Notification.Action.Builder(
        null,
        if (overlayRunning) "关闭悬浮球" else "悬浮球连拍",
        actionIntent(
          context,
          if (overlayRunning) ACTION_STOP_OVERLAY else ACTION_START_OVERLAY,
          24084,
        ),
      ).build(),
    )
    return builder.build()
  }

  fun hide(context: Context) {
    ScreenCaptureStore.setNotificationEnabled(context, false)
    context.stopService(Intent(context, ScreenCaptureOverlayService::class.java))
    context.getSystemService(NotificationManager::class.java)
      .cancel(NOTIFICATION_ID)
  }

  /** Brings Nya 记账 to the front; App.tsx then consumes pending screenshots. */
  fun openApp(context: Context) {
    ScreenCaptureOverlayService.stop(context)
    refresh(context)
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
