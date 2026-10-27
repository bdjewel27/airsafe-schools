package com.airsafe.schools.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.model.StaffInviteRequest
import com.airsafe.schools.util.AppLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Dedicated ViewModel for Coordinator Staff Management (F-12).
 * Manages staff member invitations, role lists, and authorization auditing.
 */
class StaffManagementViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "StaffManagementVM"
    }

    private val _invitedStaff = MutableStateFlow<List<StaffItem>>(emptyList())
    val invitedStaff: StateFlow<List<StaffItem>> = _invitedStaff.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadStaff(schoolId: String = "school-dhaka-001") {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                AppLog.d(TAG, "Loading staff from schools/$schoolId/staff")
                val resp = AirSafeApiClient.service.getStaff(schoolId)
                if (resp.staff.isNotEmpty()) {
                    _invitedStaff.value = resp.staff.map {
                        StaffItem(
                            email = it.email,
                            roleBn = it.roleBn ?: "শিক্ষক",
                            roleEn = it.roleEn ?: "Teacher"
                        )
                    }
                    AppLog.d(TAG, "Staff loaded: ${_invitedStaff.value.size} members")
                } else {
                    _invitedStaff.value = emptyList()
                }
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in loadStaff: ${e.message}", e)
                _error.value = e.message
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun inviteTeacher(email: String, schoolId: String = "school-dhaka-001", onSuccess: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                AirSafeApiClient.service.inviteStaff(schoolId, StaffInviteRequest(email = email, role = "TEACHER"))
                loadStaff(schoolId)
                onSuccess()
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in inviteTeacher: ${e.message}", e)
                _error.value = e.message
            }
        }
    }
}
