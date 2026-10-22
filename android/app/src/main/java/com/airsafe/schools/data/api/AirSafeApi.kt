package com.airsafe.schools.data.api

import android.content.Context
import android.util.Log
import com.airsafe.schools.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

interface AirSafeApiService {
    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): LoginResponse

    @GET("schools/{schoolId}/current-decision")
    suspend fun getCurrentDecision(
        @Path("schoolId") schoolId: String
    ): DecisionResponse

    @GET("schools/{schoolId}/staff")
    suspend fun getStaff(
        @Path("schoolId") schoolId: String
    ): StaffListResponse

    @GET("schools/{schoolId}/sensor-sites")
    suspend fun getSensorSites(
        @Path("schoolId") schoolId: String
    ): SensorSitesResponse

    @GET("schools/{schoolId}/analytics")
    suspend fun getAnalytics(
        @Path("schoolId") schoolId: String
    ): AnalyticsResponseDto

    @POST("schools/{schoolId}/routines")
    suspend fun updateRoutine(
        @Path("schoolId") schoolId: String,
        @Body request: RoutineUpdateRequest
    ): Map<String, Any>

    @POST("schools/{schoolId}/overrides")
    suspend fun submitOverride(
        @Path("schoolId") schoolId: String,
        @Body request: OverrideRequest
    ): Map<String, Any>

    @POST("schools/{schoolId}/notes")
    suspend fun submitNote(
        @Path("schoolId") schoolId: String,
        @Body request: NoteRequest
    ): Map<String, Any>

    @GET("schools/{schoolId}/notes")
    suspend fun getNotes(
        @Path("schoolId") schoolId: String
    ): NotesListResponse

    @POST("schools/{schoolId}/staff/invite")
    suspend fun inviteStaff(
        @Path("schoolId") schoolId: String,
        @Body request: StaffInviteRequest
    ): Map<String, Any>

    @POST("schools/{schoolId}/assistant/chat")
    suspend fun askAssistant(
        @Path("schoolId") schoolId: String,
        @Body request: AssistantChatRequest
    ): AssistantChatResponse
}

object AirSafeApiClient {
    private const val TAG = "API_DEBUG"
    private const val PREFS_NAME = "airsafe_api_config"
    private const val KEY_BASE_URL = "base_url"

    // AWS Live API Gateway Endpoint (ap-southeast-2 Sydney dev stage)
    const val AWS_LIVE_BASE_URL = "https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/"
    const val USB_BASE_URL = "http://127.0.0.1:3000/"
    const val LAN_BASE_URL = "http://192.168.31.37:3000/"
    const val DEFAULT_BASE_URL = AWS_LIVE_BASE_URL

    @Volatile
    private var currentBaseUrl: String = DEFAULT_BASE_URL

    @Volatile
    var authToken: String? = null

    @Volatile
    private var _service: AirSafeApiService? = null

    val service: AirSafeApiService
        get() {
            return _service ?: synchronized(this) {
                _service ?: buildService(currentBaseUrl).also { _service = it }
            }
        }

    fun init(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        // Force upgrade legacy local/emulator URLs to the live AWS Sydney API Gateway endpoint
        val targetUrl = if (savedUrl.contains("127.0.0.1") || savedUrl.contains("localhost") || savedUrl.contains("192.168.")) {
            prefs.edit().putString(KEY_BASE_URL, AWS_LIVE_BASE_URL).apply()
            AWS_LIVE_BASE_URL
        } else {
            savedUrl
        }
        setBaseUrl(targetUrl, context)
    }

    fun getBaseUrl(): String = currentBaseUrl

    @Synchronized
    fun setBaseUrl(newUrl: String, context: Context? = null) {
        var normalized = newUrl.trim()
        if (normalized.isBlank()) {
            normalized = DEFAULT_BASE_URL
        }
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
            normalized = "http://$normalized"
        }
        if (!normalized.endsWith("/")) {
            normalized = "$normalized/"
        }

        currentBaseUrl = normalized
        _service = buildService(normalized)
        Log.d(TAG, "AirSafeApiClient Base URL set to: $normalized")

        context?.let { ctx ->
            try {
                ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_BASE_URL, normalized)
                    .apply()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to persist base URL: ${e.message}", e)
            }
        }
    }

    private fun buildService(baseUrl: String): AirSafeApiService {
        val logging = HttpLoggingInterceptor { message ->
            Log.d(TAG, "[HTTP] $message")
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val original = chain.request()
                val reqBuilder = original.newBuilder()
                val token = authToken
                if (!token.isNullOrBlank()) {
                    reqBuilder.header("Authorization", "Bearer $token")
                }
                Log.d(TAG, "--> ${original.method} ${original.url}")
                val response = chain.proceed(reqBuilder.build())
                Log.d(TAG, "<-- ${response.code} ${original.url} (${response.message})")
                response
            }
            .addInterceptor(logging)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .writeTimeout(8, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(AirSafeApiService::class.java)
    }
}
