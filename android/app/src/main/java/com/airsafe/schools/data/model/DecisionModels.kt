package com.airsafe.schools.data.model

import com.google.gson.annotations.SerializedName

/**
 * Fail-closed DecisionResponse model (Hard Gate 4).
 * Missing or null fields NEVER default to GREEN/PROCEED or fabricated safe numbers.
 */
data class DecisionResponse(
    @SerializedName("school_id") val schoolId: String? = null,
    @SerializedName("school_name") val schoolName: String? = null,
    @SerializedName("status") val status: String? = "UNKNOWN", // "GREEN", "YELLOW", "ORANGE", "RED", "UNKNOWN"
    @SerializedName("decision") val decision: String? = "UNKNOWN", // "PROCEED", "PROCEED_WITH_PRECAUTIONS", "MODIFY", "MOVE_INDOORS", "UNKNOWN"
    @SerializedName("policy_floor_decision") val policyFloorDecision: String? = null,
    @SerializedName("heat_index_c") val heatIndexC: Double? = null,
    @SerializedName("aqi") val aqi: Int? = null,
    @SerializedName("pm25_ugm3") val pm25Ugm3: Double? = null,
    @SerializedName("primary_reason") val primaryReason: String? = null,
    @SerializedName("reasons") val reasons: List<String>? = emptyList(),
    @SerializedName("max_duration_minutes") val maxDurationMinutes: Int? = null,
    @SerializedName("requires_shade") val requiresShade: Boolean? = true,
    @SerializedName("is_stale") val isStale: Boolean? = true,
    @SerializedName("is_modeled") val isModeled: Boolean? = true,
    @SerializedName("last_updated") val lastUpdated: String? = null,
    @SerializedName("current_activity_bn") val currentActivityBn: String? = null,
    @SerializedName("current_activity_en") val currentActivityEn: String? = null,
    @SerializedName("next_activity_bn") val nextActivityBn: String? = null,
    @SerializedName("next_activity_en") val nextActivityEn: String? = null,
    @SerializedName("routine_intensity") val routineIntensity: String? = null,
    @SerializedName("active_override") val activeOverride: String? = null,
    @SerializedName("confidence_level_pct") val confidenceLevelPct: Int? = null,
    @SerializedName("weather_trend_bn") val weatherTrendBn: String? = null,
    @SerializedName("weather_trend_en") val weatherTrendEn: String? = null
) {
    /**
     * Hard Gate 4 Fail-Closed Sanitizer:
     * If decision/status or both environmental metrics (heatIndexC and aqi) are missing,
     * fail closed to UNKNOWN — never synthesize GREEN/PROCEED or fake sensor readings.
     */
    fun sanitized(): DecisionResponse {
        val hasValidMetrics = (heatIndexC != null && heatIndexC.isFinite()) && (aqi != null && aqi >= 0)
        val validDecisions = setOf("PROCEED", "PROCEED_WITH_PRECAUTIONS", "MODIFY", "MOVE_INDOORS")
        val normalizedDecision = decision?.uppercase()?.trim()

        val safeDecision = if (hasValidMetrics && normalizedDecision != null && validDecisions.contains(normalizedDecision)) {
            normalizedDecision
        } else {
            "UNKNOWN"
        }

        val safeStatus = when (safeDecision) {
            "PROCEED" -> "GREEN"
            "PROCEED_WITH_PRECAUTIONS" -> "YELLOW"
            "MODIFY" -> "ORANGE"
            "MOVE_INDOORS" -> "RED"
            else -> "UNKNOWN"
        }

        val defaultReason = if (safeDecision == "UNKNOWN") {
            "সেন্সর বা আবহাওয়া ডেটা পাওয়া যায়নি — অনুগ্রহ করে কোঅর্ডিনেটরের সাথে যোগাযোগ করুন (Data unavailable — fail-closed)"
        } else {
            primaryReason ?: "স্বাভাবিক পরিবেশ (Policy v1.2 সীমার মধ্যে)"
        }

        return this.copy(
            schoolId = schoolId ?: "school-dhaka-001",
            schoolName = if (schoolName.isNullOrBlank() || schoolName == "School") "ঢাকা মডেল স্কুল (Dhaka Model School)" else schoolName,
            status = safeStatus,
            decision = safeDecision,
            heatIndexC = if (safeDecision == "UNKNOWN") null else heatIndexC,
            aqi = if (safeDecision == "UNKNOWN") null else aqi,
            pm25Ugm3 = if (safeDecision == "UNKNOWN") null else pm25Ugm3,
            primaryReason = defaultReason,
            reasons = if (reasons.isNullOrEmpty()) listOf(defaultReason) else reasons,
            maxDurationMinutes = if (safeDecision == "UNKNOWN") null else maxDurationMinutes,
            requiresShade = requiresShade ?: (safeDecision != "PROCEED"),
            isStale = if (safeDecision == "UNKNOWN") true else (isStale ?: true),
            isModeled = isModeled ?: true,
            lastUpdated = lastUpdated,
            currentActivityBn = if (currentActivityBn.isNullOrBlank()) "তথ্য নেই" else currentActivityBn,
            currentActivityEn = if (currentActivityEn.isNullOrBlank()) "No routine scheduled" else currentActivityEn,
            nextActivityBn = if (nextActivityBn.isNullOrBlank()) null else nextActivityBn,
            nextActivityEn = if (nextActivityEn.isNullOrBlank()) null else nextActivityEn,
            routineIntensity = routineIntensity,
            confidenceLevelPct = if (confidenceLevelPct != null && confidenceLevelPct > 0) confidenceLevelPct else null
        )
    }
}

data class LoginRequest(
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String
)

data class AuthenticatedUserDto(
    @SerializedName("email") val email: String,
    @SerializedName("role") val role: String,
    @SerializedName("school_id") val schoolId: String,
    @SerializedName("name_bn") val nameBn: String?,
    @SerializedName("name_en") val nameEn: String?,
    @SerializedName("school_name_bn") val schoolNameBn: String?,
    @SerializedName("school_name_en") val schoolNameEn: String?
)

data class LoginResponse(
    @SerializedName("token") val token: String,
    @SerializedName("user") val user: AuthenticatedUserDto
)

data class RoutineUpdateRequest(
    @SerializedName("activity_name_bn") val activityNameBn: String,
    @SerializedName("activity_name_en") val activityNameEn: String,
    @SerializedName("next_activity_bn") val nextActivityBn: String? = null,
    @SerializedName("next_activity_en") val nextActivityEn: String? = null,
    @SerializedName("intensity") val intensity: String,
    @SerializedName("duration_minutes") val durationMinutes: Int = 45,
    @SerializedName("target_class") val targetClass: String? = null
)

data class StaffItemDto(
    @SerializedName("email") val email: String,
    @SerializedName("roleBn") val roleBn: String?,
    @SerializedName("roleEn") val roleEn: String?
)

data class StaffListResponse(
    @SerializedName("staff") val staff: List<StaffItemDto>
)

data class SensorSiteDto(
    @SerializedName("id") val id: String,
    @SerializedName("name_bn") val nameBn: String,
    @SerializedName("name_en") val nameEn: String,
    @SerializedName("location_type") val locationType: String,
    @SerializedName("temp_c") val tempC: Double?,
    @SerializedName("rh_pct") val rhPct: Double?,
    @SerializedName("pm25_ugm3") val pm25Ugm3: Double?,
    @SerializedName("heat_index_c") val heatIndexC: Double?,
    @SerializedName("is_online") val isOnline: Boolean,
    @SerializedName("last_updated_bn") val lastUpdatedBn: String?,
    @SerializedName("last_updated_en") val lastUpdatedEn: String?
)

data class SensorSitesResponse(
    @SerializedName("sites") val sites: List<SensorSiteDto>
)

data class AnalyticsResponseDto(
    @SerializedName("period_bn") val periodBn: String?,
    @SerializedName("period_en") val periodEn: String?,
    @SerializedName("avg_aqi") val avgAqi: Int,
    @SerializedName("max_heat_index_c") val maxHeatIndexC: Double,
    @SerializedName("total_indoor_hours") val totalIndoorHours: Int,
    @SerializedName("warning_days_count") val warningDaysCount: Int,
    @SerializedName("trend_direction") val trendDirection: String?,
    @SerializedName("total_sessions_analyzed") val totalSessionsAnalyzed: Int
)

data class OverrideRequest(
    @SerializedName("decision") val decision: String,
    @SerializedName("reason") val reason: String
)

data class NoteRequest(
    @SerializedName("note") val note: String,
    @SerializedName("has_respiratory_condition") val hasRespiratoryCondition: Boolean
)

data class StaffInviteRequest(
    @SerializedName("email") val email: String,
    @SerializedName("role") val role: String = "TEACHER"
)

data class AssistantChatRequest(
    @SerializedName("query") val query: String,
    @SerializedName("is_bengali") val isBengali: Boolean
)

data class AssistantChatResponse(
    @SerializedName("answer") val answer: String,
    @SerializedName("decision") val decision: String? = null,
    @SerializedName("heat_index_c") val heatIndexC: Double? = null,
    @SerializedName("aqi") val aqi: Int? = null,
    @SerializedName("citation_id") val citationId: String? = null,
    @SerializedName("citation_excerpt") val citationExcerpt: String? = null,
    @SerializedName("doc_id") val docId: String? = null
)

sealed interface DecisionUiState {
    data object Loading : DecisionUiState
    data class Success(val data: DecisionResponse) : DecisionUiState
    data class Error(val message: String) : DecisionUiState
}

data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
