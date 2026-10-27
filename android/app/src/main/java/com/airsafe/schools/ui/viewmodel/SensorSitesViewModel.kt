package com.airsafe.schools.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.local.AirSafeDatabaseHelper
import com.airsafe.schools.data.model.SensorSite
import com.airsafe.schools.util.AppLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Dedicated ViewModel for Multi-Sensor Sites & Station Freshness Screen.
 * Manages playground, classroom, and rooftop microclimate sensor readings with SQLite caching.
 */
class SensorSitesViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "SensorSitesViewModel"
    }

    private val dbHelper = AirSafeDatabaseHelper.getInstance(application)

    private val _sensorSites = MutableStateFlow<List<SensorSite>>(emptyList())
    val sensorSites: StateFlow<List<SensorSite>> = _sensorSites.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun loadSensorSites(schoolId: String = "school-dhaka-001") {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                AppLog.d(TAG, "Loading sensor sites from schools/$schoolId/sensor-sites")
                val resp = AirSafeApiClient.service.getSensorSites(schoolId)
                val allSites = resp.sites.toMutableList()
                if (resp.districtBaseline != null && allSites.none { it.locationType == "DISTRICT" || it.id == resp.districtBaseline.id }) {
                    allSites.add(resp.districtBaseline)
                }
                if (allSites.isNotEmpty()) {
                    val sites = allSites.map { siteDto ->
                        SensorSite(
                            id = siteDto.id,
                            nameBn = siteDto.nameBn,
                            nameEn = siteDto.nameEn,
                            locationType = siteDto.locationType,
                            tempC = siteDto.tempC,
                            rhPct = siteDto.rhPct,
                            pm25Ugm3 = siteDto.pm25Ugm3,
                            heatIndexC = siteDto.heatIndexC,
                            isOnline = siteDto.isOnline,
                            lastUpdatedBn = siteDto.lastUpdatedBn ?: "এইমাত্র",
                            lastUpdatedEn = siteDto.lastUpdatedEn ?: "Just now"
                        )
                    }
                    _sensorSites.value = sites
                    try {
                        dbHelper.saveSensorSites(schoolId, sites)
                    } catch (dbErr: Exception) {
                        AppLog.e(TAG, "Failed to persist sensor sites: ${dbErr.message}", dbErr)
                    }
                } else {
                    _sensorSites.value = emptyList()
                }
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in loadSensorSites: ${e.message}", e)
                val cachedDbSites: List<SensorSite>? = try { dbHelper.getSensorSites(schoolId) } catch (_: Exception) { null }
                if (!cachedDbSites.isNullOrEmpty()) {
                    _sensorSites.value = cachedDbSites.map { site ->
                        site.copy(
                            isOnline = false,
                            lastUpdatedBn = "ক্যাশে সংরক্ষিত (SQLite)",
                            lastUpdatedEn = "Cached offline (SQLite)"
                        )
                    }
                } else if (_sensorSites.value.isEmpty()) {
                    _sensorSites.value = emptyList()
                }
            } finally {
                _isLoading.value = false
            }
        }
    }
}
