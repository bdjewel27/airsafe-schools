package com.airsafe.schools.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.model.TrendPoint
import com.airsafe.schools.util.AppLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Dedicated ViewModel for Telemetry Trends & Historical Analysis Screen.
 * Manages 24-hour / weekly trend points, range filtering, comparison site telemetry, and table view.
 */
class TrendsViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "TrendsViewModel"
    }

    private val _trendData = MutableStateFlow<List<TrendPoint>>(emptyList())
    val trendData: StateFlow<List<TrendPoint>> = _trendData.asStateFlow()

    private val _isTrendsLoading = MutableStateFlow(false)
    val isTrendsLoading: StateFlow<Boolean> = _isTrendsLoading.asStateFlow()

    private val _trendsError = MutableStateFlow<String?>(null)
    val trendsError: StateFlow<String?> = _trendsError.asStateFlow()

    private val _selectedTrendRange = MutableStateFlow("24h")
    val selectedTrendRange: StateFlow<String> = _selectedTrendRange.asStateFlow()

    private val _compareSiteId = MutableStateFlow<String?>(null)
    val compareSiteId: StateFlow<String?> = _compareSiteId.asStateFlow()

    private val _trendPeriodLabel = MutableStateFlow("২৪ ঘণ্টার ট্রেন্ড")
    val trendPeriodLabel: StateFlow<String> = _trendPeriodLabel.asStateFlow()

    fun setTrendRange(range: String, schoolId: String = "school-dhaka-001", isBengali: Boolean = false) {
        _selectedTrendRange.value = range
        loadTrends(schoolId = schoolId, range = range, compareSiteId = _compareSiteId.value, isBengali = isBengali)
    }

    fun setComparisonSite(siteId: String?, schoolId: String = "school-dhaka-001", isBengali: Boolean = false) {
        _compareSiteId.value = siteId
        loadTrends(schoolId = schoolId, range = _selectedTrendRange.value, compareSiteId = siteId, isBengali = isBengali)
    }

    fun loadTrends(
        schoolId: String = "school-dhaka-001",
        range: String = _selectedTrendRange.value,
        siteId: String? = null,
        compareSiteId: String? = _compareSiteId.value,
        isBengali: Boolean = false
    ) {
        viewModelScope.launch {
            _isTrendsLoading.value = true
            _trendsError.value = null
            try {
                AppLog.d(TAG, "Loading trends from schools/$schoolId/trends?range=$range&compare_site_id=$compareSiteId")
                val resp = AirSafeApiClient.service.getTrends(schoolId, range, siteId, compareSiteId)
                _trendPeriodLabel.value = if (isBengali) resp.periodBn ?: "২৪ ঘণ্টার ট্রেন্ড" else resp.periodEn ?: "24-Hour Trend"
                val validPoints = resp.points.mapNotNull { p ->
                    val hi = p.heatIndexC
                    val aqiVal = p.aqi
                    if (hi == null || aqiVal == null) null
                    else TrendPoint(
                        timeLabelBn = p.timeLabelBn ?: "",
                        timeLabelEn = p.timeLabelEn ?: "",
                        heatIndexC = hi,
                        aqi = aqiVal,
                        isDangerous = p.isDangerous ?: (hi >= 39.0 || aqiVal >= 151),
                        isSchoolHours = p.isSchoolHours ?: false,
                        isShaded = p.isShaded ?: false,
                        comparisonHeatIndexC = p.comparisonHeatIndexC,
                        comparisonAqi = p.comparisonAqi,
                        deltaHeatIndexC = p.deltaHeatIndexC,
                        deltaAqi = p.deltaAqi
                    )
                }
                _trendData.value = validPoints
                if (validPoints.isEmpty()) {
                    _trendsError.value = if (isBengali) "নির্বাচিত সময়ের জন্য কোনো যাচাইকৃত ট্রেন্ড ডেটা পাওয়া যায়নি।" else "No verified trend telemetry available for the selected range."
                }
                AppLog.d(TAG, "Trends loaded successfully (${_trendData.value.size} points)")
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in loadTrends: ${e.message}", e)
                _trendsError.value = if (isBengali) {
                    "ট্রেন্ড ডেটা লোড করা যায়নি (${e.javaClass.simpleName}): অনুগ্রহ করে পুনরায় চেষ্টা করুন।"
                } else {
                    "Failed to load trends (${e.javaClass.simpleName}): Please retry."
                }
            } finally {
                _isTrendsLoading.value = false
            }
        }
    }
}
