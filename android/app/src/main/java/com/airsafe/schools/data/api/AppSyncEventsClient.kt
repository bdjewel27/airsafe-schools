package com.airsafe.schools.data.api

import android.util.Log
import com.airsafe.schools.data.model.DecisionResponse
import com.google.gson.Gson
import okhttp3.*
import java.util.concurrent.TimeUnit

/**
 * AWS AppSync Events WebSocket client for real-time fan-out on /schools/{schoolId}/events.
 * Operates when app is in the foreground. Disconnects cleanly on backgrounding or offline switch.
 */
class AppSyncEventsClient(
    private val onDecisionUpdated: (DecisionResponse) -> Unit,
    private val onConnectionStatusChanged: (Boolean) -> Unit = {}
) {
    companion object {
        private const val TAG = "AppSyncEvents"
    }

    private val gson = Gson()
    private val okHttpClient = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // Indefinite streaming for WebSocket
        .build()

    @Volatile
    private var webSocket: WebSocket? = null

    @Volatile
    private var isConnected: Boolean = false

    @Volatile
    private var activeSchoolId: String? = null

    @Volatile
    private var isForeground: Boolean = false

    fun isConnected(): Boolean = isConnected

    /**
     * Subscribes to the school's AppSync Events channel via WebSocket.
     */
    @Synchronized
    fun connect(baseUrl: String, schoolId: String) {
        disconnect()
        activeSchoolId = schoolId
        isForeground = true

        val wsScheme = if (baseUrl.startsWith("https://", ignoreCase = true)) "wss://" else "ws://"
        val hostPart = baseUrl
            .removePrefix("http://")
            .removePrefix("https://")
            .removePrefix("HTTP://")
            .removePrefix("HTTPS://")
            .trimEnd('/')

        val wsUrl = "$wsScheme$hostPart/schools/$schoolId/events"
        val token = AirSafeApiClient.authToken
        val wsUrlWithToken = if (!token.isNullOrBlank()) "$wsUrl?token=$token" else wsUrl
        Log.d(TAG, "Subscribing to AWS AppSync Events channel: $wsUrl (authenticated: ${!token.isNullOrBlank()})")

        val reqBuilder = Request.Builder().url(wsUrlWithToken)
        if (!token.isNullOrBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }

        webSocket = okHttpClient.newWebSocket(reqBuilder.build(), object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.d(TAG, "Connected to AppSync Events channel for school: $schoolId")
                isConnected = true
                onConnectionStatusChanged(true)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                Log.d(TAG, "Received real-time event frame (${text.length} chars)")
                try {
                    val parsed = gson.fromJson(text, DecisionResponse::class.java)?.sanitized()
                    if (parsed != null && !parsed.decision.isNullOrBlank()) {
                        onDecisionUpdated(parsed)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error deserializing AppSync event: ${e.message}")
                }
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "AppSync WebSocket closing: $code / $reason")
                isConnected = false
                onConnectionStatusChanged(false)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "AppSync WebSocket closed: $code / $reason")
                isConnected = false
                onConnectionStatusChanged(false)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "AppSync WebSocket connection failure: ${t.message}")
                isConnected = false
                onConnectionStatusChanged(false)
            }
        })
    }

    /**
     * Unsubscribes and closes WebSocket cleanly when app is backgrounded or switched offline.
     */
    @Synchronized
    fun disconnect() {
        isForeground = false
        isConnected = false
        try {
            webSocket?.close(1000, "Foreground exited / clean close")
        } catch (e: Exception) {
            Log.e(TAG, "Error during WebSocket clean close: ${e.message}")
        }
        webSocket = null
        onConnectionStatusChanged(false)
    }
}
