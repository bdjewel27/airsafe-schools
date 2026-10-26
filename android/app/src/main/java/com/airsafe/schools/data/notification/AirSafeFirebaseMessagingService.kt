package com.airsafe.schools.data.notification

import com.airsafe.schools.util.AppLog
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * AirSafeFirebaseMessagingService (F-06)
 * Handles incoming Firebase Cloud Messaging notifications when the app is in the background
 * or closed. Dispatches local notification with direct PendingIntent to the explanation screen.
 */
class AirSafeFirebaseMessagingService : FirebaseMessagingService() {
    companion object {
        private const val TAG = "AirSafeFCM"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        AppLog.d(TAG, "FCM alert received from: ${remoteMessage.from}")

        val title = remoteMessage.notification?.title
            ?: remoteMessage.data["title"]
            ?: "AirSafe Emergency Alert"
        val body = remoteMessage.notification?.body
            ?: remoteMessage.data["body"]
            ?: "Outdoor activity decision changed. Check safety guidelines."

        // Post high-priority notification with target_screen = EXPLANATION
        AirSafeNotificationHelper.sendDangerAlert(
            context = applicationContext,
            title = title,
            message = body,
            data = remoteMessage.data
        )
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        AppLog.d(TAG, "FCM registration token updated: $token")
    }
}
