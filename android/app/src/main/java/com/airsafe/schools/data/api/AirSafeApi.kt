package com.airsafe.schools.data.api

import android.content.Context
import com.airsafe.schools.BuildConfig
import com.airsafe.schools.data.model.*
import com.airsafe.schools.util.AppLog
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

    @GET("schools/{schoolId}/trends")
    suspend fun getTrends(
        @Path("schoolId") schoolId: String,
        @Query("range") range: String = "24h",
        @Query("site_id") siteId: String? = null,
        @Query("compare_site_id") compareSiteId: String? = null
    ): TrendsResponseDto

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

    @GET("schools/{schoolId}/overrides/audit")
    suspend fun getOverrideAuditLogs(
        @Path("schoolId") schoolId: String
    ): OverrideAuditResponse

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
    const val DEFAULT_BASE_URL = AWS_LIVE_BASE_URL

    // Local development endpoints - strictly restricted to debug builds (S5)
    val USB_BASE_URL: String = BuildConfig.USB_BASE_URL
    val LAN_BASE_URL: String = BuildConfig.LAN_BASE_URL

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
        // Force upgrade legacy local/emulator URLs or cleartext URLs in release to live AWS endpoint (S5)
        val isLocalOrCleartext = savedUrl.contains("127.0.0.1") ||
            savedUrl.contains("localhost") ||
            savedUrl.contains("192.168.") ||
            (!BuildConfig.DEBUG && savedUrl.startsWith("http://"))

        val targetUrl = if (!BuildConfig.DEBUG && isLocalOrCleartext) {
            prefs.edit().putString(KEY_BASE_URL, AWS_LIVE_BASE_URL).apply()
            AWS_LIVE_BASE_URL
        } else if (savedUrl.contains("127.0.0.1") || savedUrl.contains("localhost") || savedUrl.contains("192.168.")) {
            if (BuildConfig.DEBUG && savedUrl.isNotBlank()) savedUrl else AWS_LIVE_BASE_URL
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
            normalized = if (BuildConfig.DEBUG) "http://$normalized" else "https://$normalized"
        }
        if (!normalized.endsWith("/")) {
            normalized = "$normalized/"
        }

        // In release builds, strictly reject cleartext HTTP URLs (S5)
        if (!BuildConfig.DEBUG && normalized.startsWith("http://")) {
            AppLog.w(TAG, "Cleartext HTTP URL rejected in release build. Reverting to AWS_LIVE_BASE_URL.")
            normalized = AWS_LIVE_BASE_URL
        }

        currentBaseUrl = normalized
        _service = buildService(normalized)
        AppLog.d(TAG, "AirSafeApiClient Base URL configured.")

        context?.let { ctx ->
            try {
                ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_BASE_URL, normalized)
                    .apply()
            } catch (e: Exception) {
                AppLog.e(TAG, "Failed to persist base URL: ${e.message}", e)
            }
        }
    }

    private fun buildService(baseUrl: String): AirSafeApiService {
        // S6: Completely disable HTTP logging in release builds, and avoid BODY logging in debug to protect tokens/passwords
        val logging = HttpLoggingInterceptor { message ->
            AppLog.d(TAG, "[HTTP] $message")
        }.apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }

        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val original = chain.request()
                val reqBuilder = original.newBuilder()
                val token = authToken
                if (!token.isNullOrBlank()) {
                    reqBuilder.header("Authorization", "Bearer $token")
                }
                AppLog.d(TAG, "--> ${original.method} ${original.url}")
                val response = chain.proceed(reqBuilder.build())
                AppLog.d(TAG, "<-- ${response.code} ${original.url} (${response.message})")
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
