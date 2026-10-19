package com.airsafe.schools.data.api

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
    // Live AWS API Gateway Dev Stage in Sydney (ap-southeast-2)
    private const val BASE_URL = "https://api.airsafe.example.internal/dev/"

    @Volatile
    var authToken: String? = null

    val service: AirSafeApiService by lazy {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val original = chain.request()
                val reqBuilder = original.newBuilder()
                val token = authToken
                if (!token.isNullOrBlank()) {
                    reqBuilder.header("Authorization", "Bearer $token")
                }
                chain.proceed(reqBuilder.build())
            }
            .addInterceptor(logging)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(AirSafeApiService::class.java)
    }
}
