package com.airsafe.schools.data.api

import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.util.AppLog
import com.google.gson.Gson
import okhttp3.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/**
 * AWS AppSync Events WebSocket client for real-time fan-out on /schools/{schoolId}/events.
 * Operates when app is in the foreground. Disconnects cleanly on backgrounding or offline switch.
 * Resilient (F-03): Automatically falls back to HTTP Event Stream (SSE / REST events) when
 * AppSync WebSocket endpoint is not deployed or unreachable on the REST host.
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

    private val fallbackHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var webSocket: WebSocket? = null

    @Volatile
    private var fallbackCall: Call? = null

    @Volatile
    private var isConnected: Boolean = false

    @Volatile
    private var activeSchoolId: String? = null

    @Volatile
    private var isForeground: Boolean = false

    fun isConnected(): Boolean = isConnected

    /**
     * Subscribes to the school's AppSync Events channel via WebSocket,
     * seamlessly falling back to HTTP Event Stream on REST host if WebSocket fails.
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
        AppLog.d(TAG, "Subscribing to AppSync Events channel for school: $schoolId (authenticated: ${!token.isNullOrBlank()})")

        // S6: Token is strictly sent via HTTP Authorization header during handshake, NEVER in query string (?token=)
        val reqBuilder = Request.Builder().url(wsUrl)
        if (!token.isNullOrBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }

        webSocket = okHttpClient.newWebSocket(reqBuilder.build(), object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                AppLog.d(TAG, "Connected to AppSync Events channel for school: $schoolId")
                isConnected = true
                onConnectionStatusChanged(true)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                AppLog.d(TAG, "Received real-time event frame (${text.length} chars)")
                handleIncomingEventJson(text)
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                AppLog.d(TAG, "AppSync WebSocket closing: $code / $reason")
                isConnected = false
                onConnectionStatusChanged(false)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                AppLog.d(TAG, "AppSync WebSocket closed: $code / $reason")
                isConnected = false
                onConnectionStatusChanged(false)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                AppLog.w(TAG, "AppSync WebSocket connection failure: ${t.message}. Falling back to HTTP Event Stream on REST host (F-03).")
                isConnected = false
                if (isForeground) {
                    startHttpEventStreamFallback(baseUrl, schoolId)
                } else {
                    onConnectionStatusChanged(false)
                }
            }
        })
    }

    private fun handleIncomingEventJson(text: String) {
        try {
            val parsed = gson.fromJson(text, DecisionResponse::class.java)?.sanitized()
            if (parsed != null && !parsed.decision.isNullOrBlank()) {
                onDecisionUpdated(parsed)
            }
        } catch (e: Exception) {
            AppLog.w(TAG, "Error deserializing real-time event: ${e.message}")
        }
    }

    private fun startHttpEventStreamFallback(baseUrl: String, schoolId: String) {
        val cleanBaseUrl = baseUrl.trimEnd('/')
        val httpUrl = "$cleanBaseUrl/schools/$schoolId/events"
        val token = AirSafeApiClient.authToken
        val reqBuilder = Request.Builder()
            .url(httpUrl)
            .header("Accept", "text/event-stream, application/json")
        if (!token.isNullOrBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }

        fallbackCall = fallbackHttpClient.newCall(reqBuilder.build())
        fallbackCall?.enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                AppLog.w(TAG, "HTTP Event Stream fallback error: ${e.message}")
                isConnected = false
                onConnectionStatusChanged(false)
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    AppLog.w(TAG, "HTTP Event Stream returned HTTP ${response.code}")
                    isConnected = false
                    onConnectionStatusChanged(false)
                    return
                }

                isConnected = true
                onConnectionStatusChanged(true)
                try {
                    val body = response.body ?: return
                    val contentType = response.header("Content-Type") ?: ""
                    if (contentType.contains("text/event-stream", ignoreCase = true)) {
                        val reader = BufferedReader(InputStreamReader(body.byteStream()))
                        var line: String?
                        while (isForeground && reader.readLine().also { line = it } != null) {
                            val curLine = line?.trim() ?: continue
                            if (curLine.startsWith("data:", ignoreCase = true)) {
                                val jsonStr = curLine.removePrefix("data:").trim()
                                if (jsonStr.isNotEmpty()) {
                                    handleIncomingEventJson(jsonStr)
                                }
                            }
                        }
                    } else {
                        val jsonStr = body.string()
                        handleIncomingEventJson(jsonStr)
                    }
                } catch (e: Exception) {
                    AppLog.w(TAG, "Error reading HTTP Event Stream: ${e.message}")
                } finally {
                    response.close()
                }
            }
        })
    }

    /**
     * Unsubscribes and closes WebSocket and HTTP fallback cleanly when app is backgrounded or switched offline.
     */
    @Synchronized
    fun disconnect() {
        isForeground = false
        isConnected = false
        try {
            webSocket?.close(1000, "Foreground exited / clean close")
        } catch (e: Exception) {
            AppLog.e(TAG, "Error during WebSocket clean close: ${e.message}")
        }
        webSocket = null
        try {
            fallbackCall?.cancel()
        } catch (_: Exception) {}
        fallbackCall = null
        onConnectionStatusChanged(false)
    }
}
