package com.airsafe.schools.data.api

import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.util.AppLog
import com.google.gson.Gson
import com.google.gson.JsonParser
import okhttp3.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/**
 * AWS AppSync Events WebSocket client for real-time fan-out on /schools/{schoolId}/events.
 * Operates when app is in the foreground. Disconnects cleanly on backgrounding or offline switch.
 * Resilient (F-03 & U-4): Parses AppSync Events WebSocket frames ("type":"data") and automatically
 * falls back to a continuous HTTP Event Stream (SSE) loop on the REST host when WebSocket is unavailable.
 */
class AppSyncEventsClient(
    private val onDecisionUpdated: (DecisionResponse) -> Unit,
    private val onConnectionStatusChanged: (Boolean) -> Unit = {}
) {
    companion object {
        private const val TAG = "AppSyncEvents"
        private const val SSE_RECONNECT_DELAY_MS = 15_000L
    }

    private val gson = Gson()
    private val okHttpClient = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // Indefinite streaming for WebSocket
        .build()

    private val fallbackHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var webSocket: WebSocket? = null

    @Volatile
    private var fallbackCall: Call? = null

    @Volatile
    private var sseLoopThread: Thread? = null

    @Volatile
    private var isConnected: Boolean = false

    @Volatile
    private var activeSchoolId: String? = null

    @Volatile
    private var isForeground: Boolean = false

    fun isConnected(): Boolean = isConnected

    /**
     * Subscribes to the school's AppSync Events channel via WebSocket,
     * seamlessly falling back to a continuous HTTP Event Stream (SSE) loop on the REST host.
     */
    @Synchronized
    fun connect(baseUrl: String, schoolId: String) {
        disconnect()
        activeSchoolId = schoolId
        isForeground = true

        val isAppSyncHost = baseUrl.contains("appsync-realtime", ignoreCase = true) || baseUrl.contains("appsync-api", ignoreCase = true)

        if (!isAppSyncHost) {
            AppLog.d(TAG, "Connecting to continuous HTTP Event Stream (SSE) on REST host for school: $schoolId")
            startContinuousSseLoop(baseUrl, schoolId)
            return
        }

        val wsScheme = if (baseUrl.startsWith("https://", ignoreCase = true)) "wss://" else "ws://"
        val hostPart = baseUrl
            .removePrefix("http://")
            .removePrefix("https://")
            .removePrefix("HTTP://")
            .removePrefix("HTTPS://")
            .trimEnd('/')

        val wsUrl = "$wsScheme$hostPart/event/realtime"
        val token = AirSafeApiClient.authToken
        AppLog.d(TAG, "Subscribing to AppSync Events WebSocket at $wsUrl for school: $schoolId (authenticated: ${!token.isNullOrBlank()})")

        // S6: Handshake with aws-appsync-event-ws subprotocol; token sent strictly via Authorization header
        val reqBuilder = Request.Builder()
            .url(wsUrl)
            .header("Sec-WebSocket-Protocol", "aws-appsync-event-ws")
        if (!token.isNullOrBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }

        webSocket = okHttpClient.newWebSocket(reqBuilder.build(), object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                AppLog.d(TAG, "Connected to AppSync Events channel for school: $schoolId")
                isConnected = true
                onConnectionStatusChanged(true)
                ws.send("{\"type\":\"connection_init\"}")
                ws.send("{\"type\":\"subscribe\",\"id\":\"$schoolId\",\"channel\":\"/default/schools/$schoolId/events\"}")
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
                AppLog.w(TAG, "AppSync WebSocket failure: ${t.message}. Falling back to continuous SSE stream (F-03/U-4).")
                isConnected = false
                if (isForeground) {
                    startContinuousSseLoop(baseUrl, schoolId)
                } else {
                    onConnectionStatusChanged(false)
                }
            }
        })
    }

    /**
     * Parses both wrapped AppSync Events frames ({"type":"data","event":"{...}"})
     * and direct DecisionResponse JSON payloads.
     */
    internal fun handleIncomingEventJson(text: String) {
        try {
            val trimmed = text.trim()
            if (trimmed.isEmpty()) return

            val rootElement = JsonParser.parseString(trimmed)
            if (!rootElement.isJsonObject) return
            val rootObj = rootElement.asJsonObject

            // Ignore AppSync keep-alive or ack frames
            val frameType = if (rootObj.has("type") && !rootObj.get("type").isJsonNull) {
                rootObj.get("type").asString
            } else null

            if (frameType == "ka" || frameType == "connection_ack" || frameType == "subscribe_success") {
                return
            }

            val payloadJson = when {
                rootObj.has("event") && rootObj.get("event").isJsonPrimitive -> rootObj.get("event").asString
                rootObj.has("event") && rootObj.get("event").isJsonObject -> rootObj.get("event").toString()
                rootObj.has("data") && rootObj.get("data").isJsonPrimitive -> rootObj.get("data").asString
                rootObj.has("data") && rootObj.get("data").isJsonObject -> rootObj.get("data").toString()
                else -> trimmed
            }

            val parsed = gson.fromJson(payloadJson, DecisionResponse::class.java)?.sanitized()
            if (parsed != null && !parsed.decision.isNullOrBlank()) {
                onDecisionUpdated(parsed)
            }
        } catch (e: Exception) {
            AppLog.w(TAG, "Error deserializing real-time event: ${e.message}")
        }
    }

    private fun startContinuousSseLoop(baseUrl: String, schoolId: String) {
        sseLoopThread?.interrupt()
        sseLoopThread = Thread {
            val cleanBaseUrl = baseUrl.trimEnd('/')
            val httpUrl = "$cleanBaseUrl/schools/$schoolId/events?stream=sse"
            while (isForeground && !Thread.currentThread().isInterrupted) {
                try {
                    val token = AirSafeApiClient.authToken
                    val reqBuilder = Request.Builder()
                        .url(httpUrl)
                        .header("Accept", "text/event-stream, application/json")
                        .header("Cache-Control", "no-cache")
                    if (!token.isNullOrBlank()) {
                        reqBuilder.header("Authorization", "Bearer $token")
                    }

                    val call = fallbackHttpClient.newCall(reqBuilder.build())
                    fallbackCall = call
                    call.execute().use { response ->
                        if (response.isSuccessful) {
                            if (!isConnected) {
                                isConnected = true
                                onConnectionStatusChanged(true)
                            }
                            val body = response.body
                            if (body != null) {
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
                            }
                        } else {
                            isConnected = false
                            onConnectionStatusChanged(false)
                        }
                    }
                } catch (_: InterruptedException) {
                    break
                } catch (e: Exception) {
                    AppLog.w(TAG, "SSE stream cycle exception: ${e.message}")
                    isConnected = false
                    onConnectionStatusChanged(false)
                }

                if (!isForeground || Thread.currentThread().isInterrupted) break
                try {
                    Thread.sleep(SSE_RECONNECT_DELAY_MS)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }.apply {
            name = "AirSafe-SSE-$schoolId"
            isDaemon = true
            start()
        }
    }

    /**
     * Unsubscribes and closes WebSocket and HTTP SSE loop cleanly when app is backgrounded or switched offline.
     */
    @Synchronized
    fun disconnect() {
        isForeground = false
        isConnected = false
        try {
            sseLoopThread?.interrupt()
        } catch (_: Exception) {}
        sseLoopThread = null
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
