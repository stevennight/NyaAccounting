package app.nya.accounting

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import kotlin.math.roundToInt

class ScreenCaptureOverlayService : Service() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var windowManager: WindowManager
  private var bubble: View? = null

  override fun onCreate() {
    super.onCreate()
    if (!Settings.canDrawOverlays(this)) {
      ScreenCaptureStore.savePendingError(this, "请先允许 Nya 记账显示在其他应用上层，才能开启悬浮球。")
      stopSelf()
      return
    }
    startForegroundSafely()
    instance = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    try {
      showBubble()
    } catch (error: Exception) {
      ScreenCaptureStore.savePendingError(
        this,
        error.message ?: "悬浮球无法显示，请检查悬浮窗权限后重试。",
      )
      stopSelf()
      return
    }
    isRunning = true
    ScreenCaptureNotification.refresh(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ScreenCaptureNotification.ACTION_STOP_OVERLAY) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (bubble == null && Settings.canDrawOverlays(this)) {
      showBubble()
      isRunning = true
    }
    return START_STICKY
  }

  override fun onDestroy() {
    mainHandler.removeCallbacksAndMessages(null)
    bubble?.let { view ->
      runCatching { windowManager.removeView(view) }
    }
    bubble = null
    isRunning = false
    if (instance === this) {
      instance = null
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startForegroundSafely() {
    val notification = ScreenCaptureNotification.build(this)
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    ) {
      startForeground(
        ScreenCaptureNotification.NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(ScreenCaptureNotification.NOTIFICATION_ID, notification)
    }
  }

  private fun showBubble() {
    if (bubble != null) {
      return
    }
    val size = dp(56)
    val params = WindowManager.LayoutParams(
      size,
      size,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(12)
      y = dp(240)
    }
    val view = ImageView(this).apply {
      setImageResource(R.mipmap.ic_launcher_foreground)
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      setPadding(dp(8), dp(8), dp(8), dp(8))
      contentDescription = "截图记账悬浮球，点击截图"
      background = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(Color.rgb(244, 250, 255), Color.rgb(214, 238, 255)),
      ).apply {
        shape = GradientDrawable.OVAL
        setStroke(dp(2), Color.rgb(79, 161, 224))
      }
      elevation = dp(6).toFloat()
    }
    var downRawX = 0f
    var downRawY = 0f
    var downX = 0
    var downY = 0
    var moved = false
    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          downX = params.x
          downY = params.y
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val deltaX = event.rawX - downRawX
          val deltaY = event.rawY - downRawY
          if (kotlin.math.abs(deltaX) > dp(4) || kotlin.math.abs(deltaY) > dp(4)) {
            moved = true
          }
          params.x = downX + deltaX.toInt()
          params.y = downY + deltaY.toInt()
          runCatching { windowManager.updateViewLayout(view, params) }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            requestCapture()
          }
          true
        }
        else -> true
      }
    }
    windowManager.addView(view, params)
    bubble = view
  }

  fun requestCapture() {
    val view = bubble ?: return
    view.visibility = View.INVISIBLE
    val service = ScreenCaptureAccessibilityService.instance
    if (service == null) {
      view.visibility = View.VISIBLE
      ScreenCaptureStore.savePendingError(this, "截图服务尚未启用，请先在系统无障碍设置中启用 Nya 记账。")
      ScreenCaptureNotification.refresh(this)
      return
    }
    val accepted = service.captureCurrentScreen {
      mainHandler.post {
        view.visibility = View.VISIBLE
        ScreenCaptureNotification.refresh(this@ScreenCaptureOverlayService)
      }
    }
    if (!accepted) {
      view.visibility = View.VISIBLE
    }
  }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density).roundToInt()

  companion object {
    @Volatile
    var isRunning: Boolean = false

    @Volatile
    var instance: ScreenCaptureOverlayService? = null

    fun start(context: android.content.Context) {
      val intent = Intent(context, ScreenCaptureOverlayService::class.java)
        .setAction(ScreenCaptureNotification.ACTION_START_OVERLAY)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: android.content.Context) {
      isRunning = false
      context.stopService(Intent(context, ScreenCaptureOverlayService::class.java))
    }
  }
}
