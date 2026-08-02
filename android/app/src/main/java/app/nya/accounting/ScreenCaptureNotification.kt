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

  fun show(context: Context): Boolean {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }

    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "当前页面截图",
          NotificationManager.IMPORTANCE_LOW,
        ).apply {
          description = "从通知栏截取当前页面并进入 Nya 记账识别"
          setShowBadge(false)
        },
      )
    }

    val actionIntent = PendingIntent.getBroadcast(
      context,
      24082,
      Intent(context, ScreenCaptureActionReceiver::class.java)
        .setAction(ACTION_CAPTURE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }
    val notification = builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Nya 记账")
      .setContentText("在支付宝等页面点击“截图记账”")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(Notification.Action.Builder(null, "截图记账", actionIntent).build())
      .build()
    manager.notify(NOTIFICATION_ID, notification)
    return true
  }

  fun hide(context: Context) {
    context.getSystemService(NotificationManager::class.java)
      .cancel(NOTIFICATION_ID)
  }
}
