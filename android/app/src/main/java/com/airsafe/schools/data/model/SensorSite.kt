package com.airsafe.schools.data.model

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
    val isDangerous: Boolean
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

