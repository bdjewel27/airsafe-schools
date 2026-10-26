package com.airsafe.schools.data.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.airsafe.schools.MainActivity
import com.airsafe.schools.util.AppLog

object AirSafeNotificationHelper {
    private const val TAG = "AirSafeNotif"
    private const val CHANNEL_ID = "airsafe_alerts"
    private const val CHANNEL_NAME = "AirSafe Emergency Alerts"
    private const val NOTIFICATION_ID = 1001

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "High priority notifications when outdoor safety limits are exceeded"
                enableVibration(true)
                enableLights(true)
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun sendDangerAlert(
        context: Context,
        title: String,
        message: String,
        data: Map<String, String> = emptyMap()
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("SHOW_EXPLANATION", true)
            putExtra("target_screen", data["target_screen"] ?: "EXPLANATION")
            putExtra("ALERT_TITLE", title)
            putExtra("ALERT_MESSAGE", message)
            data["decision"]?.let { putExtra("DECISION", it) }
            data["reason"]?.let { putExtra("REASON", it) }
            data["heatIndex"]?.let { putExtra("HEAT_INDEX", it) }
            data["aqi"]?.let { putExtra("AQI", it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        try {
            val manager = NotificationManagerCompat.from(context)
            manager.notify(NOTIFICATION_ID, builder.build())
            AppLog.d(TAG, "Notification posted successfully: $title - $message (target: EXPLANATION)")
        } catch (e: Throwable) {
            AppLog.e(TAG, "Notification dispatch error: ${e.message}", e)
        }
    }
}
