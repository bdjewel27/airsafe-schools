package com.airsafe.schools.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.model.LoginRequest
import com.airsafe.schools.data.model.UserRole
import com.airsafe.schools.data.model.UserSession
import com.airsafe.schools.util.AppLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Dedicated ViewModel for Authentication & Staff Session Management.
 * Manages login state, credentials submission to Cognito / backend, and session lifecycle.
 */
class AuthViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "AuthViewModel"
    }

    private val _userSession = MutableStateFlow<UserSession?>(null)
    val userSession: StateFlow<UserSession?> = _userSession.asStateFlow()

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun authenticateStaff(
        emailInput: String,
        passwordInput: String,
        isBengali: Boolean = false,
        onSuccess: (UserSession) -> Unit = {}
    ) {
        val normalizedEmail = emailInput.trim().lowercase()
        _loginError.value = null
        _isLoading.value = true
        AppLog.d(TAG, "Attempting authentication for: $normalizedEmail")

        viewModelScope.launch {
            try {
                val loginResp = AirSafeApiClient.service.login(LoginRequest(normalizedEmail, passwordInput))
                AppLog.d(TAG, "Login successful: role=${loginResp.user.role}, school=${loginResp.user.schoolId}")
                val resolvedRole = when (loginResp.user.role.uppercase()) {
                    "COORDINATOR" -> UserRole.COORDINATOR
                    "PLATFORM_ADMIN" -> UserRole.PLATFORM_ADMIN
                    else -> UserRole.TEACHER
                }
                AirSafeApiClient.authToken = loginResp.token
                val resolvedSchoolId = loginResp.user.schoolId
                    ?: (if (normalizedEmail.contains("chittagong") || normalizedEmail.contains("chattogram") || normalizedEmail.contains("chs") || normalizedEmail.contains("ctg")) "school-chattogram-001" else "school-dhaka-001")
                val session = UserSession(
                    email = loginResp.user.email,
                    nameBn = loginResp.user.nameBn ?: "স্কুল স্টাফ",
                    nameEn = loginResp.user.nameEn ?: "School Staff",
                    role = resolvedRole,
                    schoolId = resolvedSchoolId,
                    schoolNameBn = loginResp.user.schoolNameBn ?: "ঢাকা মডেল স্কুল",
                    schoolNameEn = loginResp.user.schoolNameEn ?: "Dhaka Model School",
                    token = loginResp.token
                )
                _userSession.value = session
                _isLoading.value = false
                onSuccess(session)
            } catch (apiEx: Exception) {
                AppLog.e(TAG, "Backend authentication error: ${apiEx.message}", apiEx)
                val msg = if (isBengali) {
                    "লগইন ব্যর্থ হয়েছে (${apiEx.javaClass.simpleName}): সঠিক ইমেইল ও পাসওয়ার্ড দিন বা সার্ভার সংযোগ (${AirSafeApiClient.getBaseUrl()}) পরীক্ষা করুন।"
                } else {
                    "Authentication failed (${apiEx.javaClass.simpleName}): Check credentials or server connection at ${AirSafeApiClient.getBaseUrl()}."
                }
                _loginError.value = msg
                _isLoading.value = false
            }
        }
    }

    fun logout(onLoggedOut: () -> Unit = {}) {
        AirSafeApiClient.authToken = null
        _userSession.value = null
        _loginError.value = null
        _isLoading.value = false
        onLoggedOut()
    }
}
