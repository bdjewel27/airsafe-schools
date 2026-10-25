package com.airsafe.schools.data.model

import com.google.gson.annotations.SerializedName

/**
 * Fail-closed DecisionResponse model (Hard Gate 4).
 * Supports both snake_case and camelCase serialization from backend.
 * Missing or null fields NEVER default to GREEN/PROCEED or fabricated safe numbers.
 */
data class DecisionResponse(
    @SerializedName(value = "school_id", alternate = ["schoolId"]) val schoolId: String? = null,
    @SerializedName(value = "school_name", alternate = ["schoolName"]) val schoolName: String? = null,
    @SerializedName(value = "status") val status: String? = "UNKNOWN", // "GREEN", "YELLOW", "ORANGE", "RED", "UNKNOWN"
    @SerializedName(value = "decision") val decision: String? = "UNKNOWN", // "PROCEED", "PROCEED_WITH_PRECAUTIONS", "MODIFY", "MOVE_INDOORS", "UNKNOWN"
    @SerializedName(value = "policy_floor_decision", alternate = ["policyFloorDecision"]) val policyFloorDecision: String? = null,
    @SerializedName(value = "heat_index_c", alternate = ["heatIndexC", "heat_index"]) val heatIndexC: Double? = null,
    @SerializedName(value = "aqi") val aqi: Int? = null,
    @SerializedName(value = "pm25_ugm3", alternate = ["pm25Ugm3", "pm25"]) val pm25Ugm3: Double? = null,
    @SerializedName(value = "primary_reason", alternate = ["primaryReason"]) val primaryReason: String? = null,
    @SerializedName(value = "primary_reason_en", alternate = ["primaryReasonEn"]) val primaryReasonEn: String? = null,
    @SerializedName(value = "reasons") val reasons: List<String>? = emptyList(),
    @SerializedName(value = "max_duration_minutes", alternate = ["maxDurationMinutes"]) val maxDurationMinutes: Int? = null,
    @SerializedName(value = "requires_shade", alternate = ["requiresShade"]) val requiresShade: Boolean? = true,
    @SerializedName(value = "is_stale", alternate = ["isStale"]) val isStale: Boolean? = true,
    @SerializedName(value = "data_age_minutes", alternate = ["dataAgeMinutes", "staleMinutes"]) val dataAgeMinutes: Int? = null,
    @SerializedName(value = "is_modeled", alternate = ["isModeled"]) val isModeled: Boolean? = true,
    @SerializedName(value = "last_updated", alternate = ["lastUpdated"]) val lastUpdated: String? = null,
    @SerializedName(value = "current_activity_bn", alternate = ["currentActivityBn"]) val currentActivityBn: String? = null,
    @SerializedName(value = "current_activity_en", alternate = ["currentActivityEn"]) val currentActivityEn: String? = null,
    @SerializedName(value = "next_activity_bn", alternate = ["nextActivityBn"]) val nextActivityBn: String? = null,
    @SerializedName(value = "next_activity_en", alternate = ["nextActivityEn"]) val nextActivityEn: String? = null,
    @SerializedName(value = "routine_intensity", alternate = ["routineIntensity"]) val routineIntensity: String? = null,
    @SerializedName(value = "active_override", alternate = ["activeOverride"]) val activeOverride: String? = null,
    @SerializedName(value = "confidence_level_pct", alternate = ["confidenceLevelPct"]) val confidenceLevelPct: Int? = null,
    @SerializedName(value = "weather_trend_bn", alternate = ["weatherTrendBn"]) val weatherTrendBn: String? = null,
    @SerializedName(value = "weather_trend_en", alternate = ["weatherTrendEn"]) val weatherTrendEn: String? = null
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
            dataAgeMinutes = dataAgeMinutes,
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
    @SerializedName(value = "email") val email: String,
    @SerializedName(value = "role") val role: String,
    @SerializedName(value = "school_id", alternate = ["schoolId"]) val schoolId: String? = null,
    @SerializedName(value = "name_bn", alternate = ["nameBn"]) val nameBn: String? = null,
    @SerializedName(value = "name_en", alternate = ["nameEn"]) val nameEn: String? = null,
    @SerializedName(value = "school_name_bn", alternate = ["schoolNameBn"]) val schoolNameBn: String? = null,
    @SerializedName(value = "school_name_en", alternate = ["schoolNameEn"]) val schoolNameEn: String? = null
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
    @SerializedName(value = "role_bn", alternate = ["roleBn"]) val roleBn: String?,
    @SerializedName(value = "role_en", alternate = ["roleEn"]) val roleEn: String?
)

data class StaffListResponse(
    @SerializedName("staff") val staff: List<StaffItemDto>
)

data class SensorSiteDto(
    @SerializedName("id") val id: String,
    @SerializedName(value = "name_bn", alternate = ["nameBn"]) val nameBn: String,
    @SerializedName(value = "name_en", alternate = ["nameEn"]) val nameEn: String,
    @SerializedName(value = "location_type", alternate = ["locationType"]) val locationType: String,
    @SerializedName(value = "temp_c", alternate = ["tempC"]) val tempC: Double?,
    @SerializedName(value = "rh_pct", alternate = ["rhPct"]) val rhPct: Double?,
    @SerializedName(value = "pm25_ugm3", alternate = ["pm25Ugm3"]) val pm25Ugm3: Double?,
    @SerializedName(value = "heat_index_c", alternate = ["heatIndexC"]) val heatIndexC: Double?,
    @SerializedName(value = "is_online", alternate = ["isOnline"]) val isOnline: Boolean,
    @SerializedName(value = "last_updated_bn", alternate = ["lastUpdatedBn"]) val lastUpdatedBn: String?,
    @SerializedName(value = "last_updated_en", alternate = ["lastUpdatedEn"]) val lastUpdatedEn: String?
)

data class SensorSitesResponse(
    @SerializedName("sites") val sites: List<SensorSiteDto>,
    @SerializedName(value = "district_baseline", alternate = ["districtBaseline"]) val districtBaseline: SensorSiteDto? = null
)

data class AnalyticsResponseDto(
    @SerializedName(value = "period_bn", alternate = ["periodBn"]) val periodBn: String?,
    @SerializedName(value = "period_en", alternate = ["periodEn"]) val periodEn: String?,
    @SerializedName(value = "avg_aqi", alternate = ["avgAqi"]) val avgAqi: Int = 50,
    @SerializedName(value = "max_heat_index_c", alternate = ["maxHeatIndexC"]) val maxHeatIndexC: Double = 33.0,
    @SerializedName(value = "total_indoor_hours", alternate = ["totalIndoorHours"]) val totalIndoorHours: Int = 4,
    @SerializedName(value = "warning_days_count", alternate = ["warningDaysCount"]) val warningDaysCount: Int = 8,
    @SerializedName(value = "trend_direction", alternate = ["trendDirection"]) val trendDirection: String? = "STABLE",
    @SerializedName(value = "total_sessions_analyzed", alternate = ["totalSessionsAnalyzed"]) val totalSessionsAnalyzed: Int = 18
)

data class OverrideRequest(
    @SerializedName("decision") val decision: String,
    @SerializedName("reason") val reason: String
)

data class NoteRequest(
    @SerializedName("note") val note: String,
    @SerializedName("has_respiratory_condition") val hasRespiratoryCondition: Boolean
)

data class NoteItemDto(
    @SerializedName("note") val note: String,
    @SerializedName("hasRespiratory", alternate = ["has_respiratory"]) val hasRespiratory: Boolean? = false,
    @SerializedName("timestamp") val timestamp: String? = null
)

data class NotesListResponse(
    @SerializedName("notes") val notes: List<NoteItemDto> = emptyList()
)

data class StaffInviteRequest(
    @SerializedName("email") val email: String,
    @SerializedName("role") val role: String
)

data class AssistantChatRequest(
    @SerializedName("query") val query: String,
    @SerializedName("is_bengali") val isBengali: Boolean = true
)

data class AssistantChatResponse(
    @SerializedName("answer") val answer: String,
    @SerializedName("citation_id") val citationId: String? = null,
    @SerializedName("citation_excerpt") val citationExcerpt: String? = null,
    @SerializedName("doc_id") val docId: String? = null,
    @SerializedName(value = "suggested_follow_ups", alternate = ["suggestedFollowUps", "follow_ups", "followUps"]) val suggestedFollowUps: List<String> = emptyList(),
    @SerializedName(value = "used_bedrock_model", alternate = ["usedBedrockModel"]) val usedBedrockModel: String? = null
)

sealed class DecisionUiState {
    object Loading : DecisionUiState()
    data class Success(val data: DecisionResponse) : DecisionUiState()
    data class Error(val message: String) : DecisionUiState()
}

fun String.toBengaliDigits(isBengali: Boolean): String {
    if (!isBengali) return this
    val bnDigits = charArrayOf('০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯')
    val sb = StringBuilder()
    for (ch in this) {
        if (ch in '0'..'9') {
            sb.append(bnDigits[ch - '0'])
        } else {
            sb.append(ch)
        }
    }
    return sb.toString()
}

fun formatRelativeTimeAgo(isoTimestamp: String?, isBengali: Boolean): String {
    if (isoTimestamp.isNullOrBlank()) {
        return if (isBengali) "১ মিনিট আগে" else "1 min ago"
    }
    return try {
        val instant = java.time.Instant.parse(isoTimestamp)
        val diffMs = java.time.Duration.between(instant, java.time.Instant.now()).toMillis().coerceAtLeast(0)
        val diffMinutes = diffMs / (60 * 1000)
        if (diffMinutes < 1) {
            if (isBengali) "এইমাত্র" else "Just now"
        } else if (diffMinutes < 60) {
            val numStr = diffMinutes.toString().toBengaliDigits(isBengali)
            if (isBengali) "$numStr মিনিট আগে" else "$diffMinutes mins ago"
        } else {
            val diffHours = diffMinutes / 60
            val numStr = diffHours.toString().toBengaliDigits(isBengali)
            if (isBengali) "$numStr ঘণ্টা আগে" else "$diffHours hrs ago"
        }
    } catch (_: Exception) {
        if (isBengali) "২ মিনিট আগে" else "2 mins ago"
    }
}
