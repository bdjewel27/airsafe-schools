package com.airsafe.schools.data.model

import com.google.gson.annotations.SerializedName

data class SensorSite(
    val id: String,
    val nameBn: String,
    val nameEn: String,
    val locationType: String, // "FIELD", "COURTYARD", "CLASSROOM"
    val tempC: Double?,
    val rhPct: Double?,
    val pm25Ugm3: Double?,
    val heatIndexC: Double?,
    val isOnline: Boolean,
    val lastUpdatedBn: String,
    val lastUpdatedEn: String
)

data class TrendPoint(
    val timeLabelBn: String,
    val timeLabelEn: String,
    val heatIndexC: Double,
    val aqi: Int,
    val isDangerous: Boolean,
    val isSchoolHours: Boolean = false,
    val isShaded: Boolean = false,
    val comparisonHeatIndexC: Double? = null,
    val comparisonAqi: Int? = null,
    val deltaHeatIndexC: Double? = null,
    val deltaAqi: Int? = null
)

data class TrendsResponseDto(
    @SerializedName("school_id") val schoolId: String? = null,
    @SerializedName("range") val range: String? = null,
    @SerializedName("period_bn") val periodBn: String? = null,
    @SerializedName("period_en") val periodEn: String? = null,
    @SerializedName("points") val points: List<TrendPointDto> = emptyList(),
    @SerializedName("comparison_points") val comparisonPoints: List<TrendPointDto> = emptyList(),
    @SerializedName("sites_compared") val sitesCompared: List<String> = emptyList()
)

data class TrendPointDto(
    @SerializedName("time_label_bn", alternate = ["timeLabelBn"]) val timeLabelBn: String? = null,
    @SerializedName("time_label_en", alternate = ["timeLabelEn"]) val timeLabelEn: String? = null,
    @SerializedName("heat_index_c", alternate = ["heatIndexC"]) val heatIndexC: Double? = null,
    @SerializedName("temperature_c", alternate = ["temperatureC"]) val temperatureC: Double? = null,
    @SerializedName("aqi") val aqi: Int? = null,
    @SerializedName("is_dangerous", alternate = ["isDangerous"]) val isDangerous: Boolean? = null,
    @SerializedName("is_school_hours", alternate = ["isSchoolHours"]) val isSchoolHours: Boolean? = null,
    @SerializedName("is_shaded", alternate = ["isShaded"]) val isShaded: Boolean? = null,
    @SerializedName("comparison_heat_index_c") val comparisonHeatIndexC: Double? = null,
    @SerializedName("comparison_aqi") val comparisonAqi: Int? = null,
    @SerializedName("delta_heat_index_c") val deltaHeatIndexC: Double? = null,
    @SerializedName("delta_aqi") val deltaAqi: Int? = null
)

data class SchoolAnalyticsSummary(
    val weekLabelBn: String,
    val weekLabelEn: String,
    val lostOutdoorMinutes: Int,
    val prevWeekLostMinutes: Int,
    val hoursAboveThreshold: Double,
    val proceedCount: Int,
    val cautionCount: Int,
    val moveIndoorsCount: Int,
    val overridesCount: Int,
    val measuredRatioPct: Int
)

