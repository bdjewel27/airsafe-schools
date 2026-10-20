package com.airsafe.schools.ui.viewmodel

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.model.*
import com.airsafe.schools.data.notification.AirSafeNotificationHelper
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AppTab {
    HOME,
    TRENDS,
    ASSISTANT,
    STAFF_MANAGEMENT, // Coordinator only (F-12)
    ANALYTICS        // Coordinator only (F-13, F-14)
}

class DecisionViewModel(application: Application) : AndroidViewModel(application) {

    private var lastAlertedStatus: String? = null

    private val _uiState = MutableStateFlow<DecisionUiState>(DecisionUiState.Loading)
    val uiState: StateFlow<DecisionUiState> = _uiState.asStateFlow()

    private val _currentTab = MutableStateFlow(AppTab.HOME)
    val currentTab: StateFlow<AppTab> = _currentTab.asStateFlow()

    private val _isBengali = MutableStateFlow(true)
    val isBengali: StateFlow<Boolean> = _isBengali.asStateFlow()

    private val _userSession = MutableStateFlow<UserSession?>(null)
    val userSession: StateFlow<UserSession?> = _userSession.asStateFlow()

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    fun clearActionError() {
        _actionError.value = null
    }

    private val prefs by lazy {
        getApplication<Application>().getSharedPreferences("airsafe_offline_cache", Context.MODE_PRIVATE)
    }
    private val gson = Gson()

    private val _sensorSites = MutableStateFlow<List<SensorSite>>(emptyList())
    val sensorSites: StateFlow<List<SensorSite>> = _sensorSites.asStateFlow()

    private val _trendData = MutableStateFlow<List<TrendPoint>>(emptyList())
    val trendData: StateFlow<List<TrendPoint>> = _trendData.asStateFlow()

    // F-08: Activity Notes added by teacher
    private val _activityNotes = MutableStateFlow<List<String>>(emptyList())
    val activityNotes: StateFlow<List<String>> = _activityNotes.asStateFlow()
    private var hasRespiratoryNote: Boolean = false
    private var currentRoutineIntensity: String = "moderate"

    // F-11: Coordinator Overrides
    private val _activeOverride = MutableStateFlow<String?>(null)
    val activeOverride: StateFlow<String?> = _activeOverride.asStateFlow()

    // F-12: Invited Staff List
    private val _invitedStaff = MutableStateFlow<List<StaffItem>>(emptyList())
    val invitedStaff: StateFlow<List<StaffItem>> = _invitedStaff.asStateFlow()

    // Selected School ID for active tenant context
    private val _selectedSchoolId = MutableStateFlow("school-dhaka-001")
    val selectedSchoolId: StateFlow<String> = _selectedSchoolId.asStateFlow()

    // F-13: School Analytics Summary (Clean Loading/Empty State without Fake Demo Data)
    private val _analyticsData = MutableStateFlow(
        SchoolAnalyticsSummary(
            weekLabelBn = "ডেটা লোড হচ্ছে...",
            weekLabelEn = "Loading Data...",
            lostOutdoorMinutes = 0,
            prevWeekLostMinutes = 0,
            hoursAboveThreshold = 0.0,
            proceedCount = 0,
            cautionCount = 0,
            moveIndoorsCount = 0,
            overridesCount = 0,
            measuredRatioPct = 0
        )
    )
    val analyticsData: StateFlow<SchoolAnalyticsSummary> = _analyticsData.asStateFlow()

    // U-3 & U-8: Offline Mode & Cached State
    private val _isOffline = MutableStateFlow(false)
    val isOffline: StateFlow<Boolean> = _isOffline.asStateFlow()

    private var cachedDecision: DecisionResponse? = null

    init {
        try {
            val cached = getCachedDecision(_selectedSchoolId.value)
            if (cached != null) {
                cachedDecision = cached
                _uiState.value = DecisionUiState.Success(cached)
            }
        } catch (_: Exception) {
            cachedDecision = null
        }
        setupNetworkMonitoring()
    }

    private fun getCachedDecision(schoolId: String): DecisionResponse? {
        if (cachedDecision?.schoolId == schoolId) return cachedDecision
        return try {
            val json = prefs.getString("cached_decision_$schoolId", null)
            if (!json.isNullOrBlank()) {
                val parsed = gson.fromJson(json, DecisionResponse::class.java)
                if (parsed.schoolId == schoolId) parsed else null
            } else null
        } catch (_: Exception) {
            null
        }
    }

    private fun saveDecisionToCache(response: DecisionResponse) {
        cachedDecision = response
        try {
            val json = gson.toJson(response)
            prefs.edit().putString("cached_decision_${response.schoolId}", json).apply()
        } catch (_: Exception) {
            // Persistent cache best effort
        }
    }

    private fun clearCache() {
        cachedDecision = null
        try {
            prefs.edit().clear().apply()
        } catch (_: Exception) {
        }
    }

    private fun setupNetworkMonitoring() {
        try {
            val cm = getApplication<Application>().getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            if (cm != null) {
                val req = android.net.NetworkRequest.Builder()
                    .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                cm.registerNetworkCallback(req, object : android.net.ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: android.net.Network) {
                        setOfflineMode(false)
                    }

                    override fun onLost(network: android.net.Network) {
                        setOfflineMode(true)
                    }
                })

                val activeNetwork = cm.activeNetwork
                val caps = cm.getNetworkCapabilities(activeNetwork)
                val isOnline = caps?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                if (!isOnline) {
                    setOfflineMode(true)
                }
            }
        } catch (e: Exception) {
            // Graceful fallback
        }
    }

    fun setTab(tab: AppTab) {
        _currentTab.value = tab
    }

    fun toggleLanguage() {
        _isBengali.value = !_isBengali.value
    }

    /**
     * Hard Gate 3 (F-01, S-2): Role and School ID are strictly controlled by the authenticated account/token,
     * never chosen by a client-side role parameter.
     */
    fun authenticateStaff(emailInput: String, passwordInput: String) {
        val normalizedEmail = emailInput.trim().lowercase()
        _loginError.value = null

        viewModelScope.launch {
            try {
                // Attempt backend /auth/login first
                val loginResp = AirSafeApiClient.service.login(LoginRequest(normalizedEmail, passwordInput))
                val resolvedRole = when (loginResp.user.role.uppercase()) {
                    "COORDINATOR" -> UserRole.COORDINATOR
                    "PLATFORM_ADMIN" -> UserRole.PLATFORM_ADMIN
                    else -> UserRole.TEACHER
                }
                AirSafeApiClient.authToken = loginResp.token
                _userSession.value = UserSession(
                    email = loginResp.user.email,
                    nameBn = loginResp.user.nameBn ?: "স্কুল স্টাফ",
                    nameEn = loginResp.user.nameEn ?: "School Staff",
                    role = resolvedRole,
                    schoolId = loginResp.user.schoolId,
                    schoolNameBn = loginResp.user.schoolNameBn ?: "ঢাকা মডেল স্কুল",
                    schoolNameEn = loginResp.user.schoolNameEn ?: "Dhaka Model School",
                    token = loginResp.token
                )
                _selectedSchoolId.value = loginResp.user.schoolId
                loadSchoolData(loginResp.user.schoolId)
            } catch (apiEx: Exception) {
                _loginError.value = if (_isBengali.value) {
                    "লগইন ব্যর্থ হয়েছে: সঠিক ইমেইল ও পাসওয়ার্ড দিন বা সার্ভার সংযোগ পরীক্ষা করুন।"
                } else {
                    "Authentication failed: Check your credentials or server connection."
                }
            }
        }
    }

    fun logout() {
        AirSafeApiClient.authToken = null
        _userSession.value = null
        _activeOverride.value = null
        _loginError.value = null
        _actionError.value = null
        _selectedSchoolId.value = "school-dhaka-001"
        clearCache()
    }

    fun loadSchoolData(schoolId: String) {
        loadCurrentDecision(schoolId)
        loadSensorSites(schoolId)
        loadAnalytics(schoolId)
        loadStaff(schoolId)
    }

    /**
     * F-08 & Policy v1.2 Section 3: Teacher activity notes.
     * If respiratory symptoms are reported, steps up the Policy v1.2 decision by 1 safety tier.
     */
    fun addActivityNote(note: String) {
        if (note.isBlank()) return
        val triggersRespiratoryStepUp = Regex(
            "(asthma|respiratory|breathing|cough|wheez|শ্বাসকষ্ট|হাঁপানি|কাশি)",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(note)

        val previousNotes = _activityNotes.value
        val previousRespiratoryState = hasRespiratoryNote

        _activityNotes.value = _activityNotes.value + note
        if (triggersRespiratoryStepUp) {
            hasRespiratoryNote = true
        }

        val schoolId = _userSession.value?.schoolId ?: return
        viewModelScope.launch {
            try {
                AirSafeApiClient.service.submitNote(
                    schoolId,
                    NoteRequest(note = note, hasRespiratoryCondition = triggersRespiratoryStepUp)
                )
                loadCurrentDecision(schoolId)
            } catch (e: Exception) {
                _activityNotes.value = previousNotes
                hasRespiratoryNote = previousRespiratoryState
                _actionError.value = if (_isBengali.value) {
                    "সংরক্ষণ হয়নি: অ্যাক্টিভিটি নোট জমা দেওয়া যায়নি (${e.message ?: "সংযোগ সমস্যা"})"
                } else {
                    "Failed to save: Activity note could not be saved (${e.message ?: "Network error"})"
                }
            }
        }
    }

    /**
     * F-11 & Hard Gate 4: Coordinator Override with mandatory reason.
     * Enforces tight-only semantics on server, reloaded authoritatively.
     */
    fun applyCoordinatorOverride(decision: String, reason: String) {
        if (_userSession.value?.role != UserRole.COORDINATOR && _userSession.value?.role != UserRole.PLATFORM_ADMIN) {
            _actionError.value = if (_isBengali.value) "সংরক্ষণ হয়নি: শুধুমাত্র কোঅর্ডিনেটর ওভাররাইড করতে পারেন" else "Failed to save: Coordinator authorization required"
            return
        }
        val cleanReason = reason.trim()
        if (cleanReason.length < 5) {
            _actionError.value = if (_isBengali.value) "সংরক্ষণ হয়নি: ওভাররাইডের কারণ অন্তত ৫ অক্ষরের হতে হবে" else "Failed to save: Override reason must be at least 5 characters"
            return
        }

        val previousOverride = _activeOverride.value
        _activeOverride.value = "$decision: $cleanReason"

        val schoolId = _userSession.value?.schoolId ?: return
        viewModelScope.launch {
            try {
                AirSafeApiClient.service.submitOverride(
                    schoolId,
                    OverrideRequest(decision = decision, reason = cleanReason)
                )
                loadCurrentDecision(schoolId)
            } catch (e: Exception) {
                _activeOverride.value = previousOverride
                _actionError.value = if (_isBengali.value) {
                    "সংরক্ষণ হয়নি: ওভাররাইড সংরক্ষণ করা যায়নি (${e.message ?: "সংযোগ সমস্যা"})"
                } else {
                    "Failed to save: Coordinator override could not be saved (${e.message ?: "Network error"})"
                }
            }
        }
    }

    /**
     * F-10 & Policy v1.2: Coordinator Routine & Intensity configuration.
     * Passes explicit intensity directly (no string parsing) and reports errors.
     */
    fun updateRoutineActivity(
        activityNameBn: String,
        activityNameEn: String,
        intensity: String = "MODERATE",
        durationMinutes: Int = 45,
        targetClass: String? = null
    ) {
        val cleanIntensity = intensity.trim().uppercase()
        val normalizedIntensity = when (cleanIntensity) {
            "LIGHT" -> "LIGHT"
            "VIGOROUS" -> "VIGOROUS"
            else -> "MODERATE"
        }
        val previousIntensity = currentRoutineIntensity
        currentRoutineIntensity = normalizedIntensity.lowercase()

        val schoolId = _userSession.value?.schoolId ?: return
        viewModelScope.launch {
            try {
                AirSafeApiClient.service.updateRoutine(
                    schoolId,
                    RoutineUpdateRequest(
                        activityNameBn = activityNameBn,
                        activityNameEn = activityNameEn,
                        intensity = normalizedIntensity,
                        durationMinutes = durationMinutes,
                        targetClass = targetClass
                    )
                )
                loadCurrentDecision(schoolId)
            } catch (e: Exception) {
                currentRoutineIntensity = previousIntensity
                _actionError.value = if (_isBengali.value) {
                    "সংরক্ষণ হয়নি: রুটিন তথ্য সংরক্ষণ করা যায়নি (${e.message ?: "সংযোগ সমস্যা"})"
                } else {
                    "Failed to save: Routine configuration could not be saved (${e.message ?: "Network error"})"
                }
            }
        }
    }

    fun inviteTeacher(email: String) {
        if (_userSession.value?.role != UserRole.COORDINATOR && _userSession.value?.role != UserRole.PLATFORM_ADMIN) {
            _actionError.value = if (_isBengali.value) "সংরক্ষণ হয়নি: শুধুমাত্র কোঅর্ডিনেটর শিক্ষক আমন্ত্রণ জানাতে পারেন" else "Failed to save: Coordinator authorization required"
            return
        }
        val cleanEmail = email.trim().lowercase()
        if (cleanEmail.isBlank() || !cleanEmail.contains("@")) {
            _actionError.value = if (_isBengali.value) "সংরক্ষণ হয়নি: সঠিক ইমেইল প্রদান করুন" else "Failed to save: Valid email required"
            return
        }

        val schoolId = _userSession.value?.schoolId ?: return
        viewModelScope.launch {
            try {
                AirSafeApiClient.service.inviteStaff(
                    schoolId,
                    StaffInviteRequest(email = cleanEmail, role = "TEACHER")
                )
                _invitedStaff.value = _invitedStaff.value + StaffItem(cleanEmail, "শিক্ষক", "Teacher")
            } catch (e: Exception) {
                _actionError.value = if (_isBengali.value) {
                    "সংরক্ষণ হয়নি: শিক্ষক আমন্ত্রণ পাঠানো যায়নি (${e.message ?: "সার্ভার সমস্যা"})"
                } else {
                    "Failed to save: Staff invitation could not be sent (${e.message ?: "Server error"})"
                }
            }
        }
    }

    fun toggleOfflineMode() {
        setOfflineMode(!_isOffline.value)
    }

    fun setOfflineMode(offline: Boolean) {
        if (_isOffline.value == offline) return
        _isOffline.value = offline
        if (offline) {
            val cached = cachedDecision ?: (_uiState.value as? DecisionUiState.Success)?.data
            if (cached != null) {
                // Apply Policy v1.2 Stale Data Cap: PROCEED must step up to PROCEED_WITH_PRECAUTIONS when stale
                val cappedDecision = if (cached.decision == "PROCEED") "PROCEED_WITH_PRECAUTIONS" else cached.decision
                val cappedStatus = if (cappedDecision == "PROCEED_WITH_PRECAUTIONS") "YELLOW" else cached.status
                // PRESERVE the genuine server lastUpdated timestamp without overwriting it!
                val offlineCopy = cached.copy(
                    decision = cappedDecision,
                    status = cappedStatus,
                    isStale = true
                )
                _uiState.value = DecisionUiState.Success(offlineCopy)
            } else {
                // Fail-closed UNKNOWN when offline with no cache
                _uiState.value = DecisionUiState.Success(buildFailClosedUnknown(_userSession.value?.schoolId ?: "school-dhaka-001"))
            }
            _sensorSites.value = _sensorSites.value.map { site ->
                site.copy(
                    isOnline = false,
                    lastUpdatedBn = "ক্যাশে সংরক্ষিত",
                    lastUpdatedEn = "Cached offline"
                )
            }
        } else {
            _sensorSites.value = _sensorSites.value.map { site ->
                site.copy(
                    isOnline = true,
                    lastUpdatedBn = "১ মিনিট আগে",
                    lastUpdatedEn = "1 min ago"
                )
            }
            val schoolId = _userSession.value?.schoolId
            if (schoolId != null) {
                loadSchoolData(schoolId)
            }
        }
    }

    /**
     * Hard Gate 4: Fail-Closed Decision Loading.
     * If network fails and no verified cache exists, returns UNKNOWN (never GREEN/PROCEED).
     */
    fun loadCurrentDecision(schoolId: String) {
        val sessionSchoolId = _userSession.value?.schoolId ?: schoolId
        val targetSchoolId = if (_userSession.value?.role == UserRole.PLATFORM_ADMIN) schoolId else sessionSchoolId

        viewModelScope.launch {
            if (_isOffline.value) {
                val cached = getCachedDecision(targetSchoolId)
                if (cached != null) {
                    val cappedDecision = if (cached.decision == "PROCEED") "PROCEED_WITH_PRECAUTIONS" else cached.decision
                    val cappedStatus = if (cappedDecision == "PROCEED_WITH_PRECAUTIONS") "YELLOW" else cached.status
                    _uiState.value = DecisionUiState.Success(cached.copy(decision = cappedDecision, status = cappedStatus, isStale = true))
                } else {
                    _uiState.value = DecisionUiState.Success(buildFailClosedUnknown(targetSchoolId))
                }
                return@launch
            }

            _uiState.value = DecisionUiState.Loading
            try {
                val rawResponse = AirSafeApiClient.service.getCurrentDecision(targetSchoolId)
                val response = rawResponse.sanitized()
                saveDecisionToCache(response)
                _uiState.value = DecisionUiState.Success(response)

                if (response.status == "RED" && lastAlertedStatus != "RED") {
                    lastAlertedStatus = "RED"
                    val title = if (_isBengali.value) "🚨 জরুরি এয়ারসেফ অ্যালার্ট: MOVE INDOORS" else "🚨 Urgent AirSafe Alert: MOVE INDOORS"
                    AirSafeNotificationHelper.sendDangerAlert(getApplication(), title, response.primaryReason ?: "")
                } else if (response.status != "RED") {
                    lastAlertedStatus = response.status
                }
            } catch (e: Exception) {
                // Hard Gate 4: NEVER fabricate GREEN / PROCEED on error! Preserve genuine lastUpdated.
                val cached = getCachedDecision(targetSchoolId)
                if (cached != null) {
                    val cappedDecision = if (cached.decision == "PROCEED") "PROCEED_WITH_PRECAUTIONS" else cached.decision
                    val cappedStatus = if (cappedDecision == "PROCEED_WITH_PRECAUTIONS") "YELLOW" else cached.status
                    val staleCached = cached.copy(
                        decision = cappedDecision,
                        status = cappedStatus,
                        isStale = true
                    )
                    _uiState.value = DecisionUiState.Success(staleCached)
                } else {
                    val unknownFallback = buildFailClosedUnknown(targetSchoolId)
                    _uiState.value = DecisionUiState.Success(unknownFallback)
                }
            }
        }
    }

    fun loadSensorSites(schoolId: String) {
        viewModelScope.launch {
            try {
                val resp = AirSafeApiClient.service.getSensorSites(schoolId)
                if (resp.sites.isNotEmpty()) {
                    _sensorSites.value = resp.sites.map { siteDto ->
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
                } else {
                    _sensorSites.value = emptyList()
                }
            } catch (_: Exception) {
                // Fail-closed: on error in production, do not render fabricated sensor numbers
                _sensorSites.value = emptyList()
            }
        }
    }

    fun loadAnalytics(schoolId: String) {
        viewModelScope.launch {
            try {
                val resp = AirSafeApiClient.service.getAnalytics(schoolId)
                _analyticsData.value = SchoolAnalyticsSummary(
                    weekLabelBn = resp.periodBn ?: "গত ৭ দিন",
                    weekLabelEn = resp.periodEn ?: "Past 7 Days",
                    lostOutdoorMinutes = resp.totalIndoorHours * 60,
                    prevWeekLostMinutes = 0,
                    hoursAboveThreshold = resp.totalIndoorHours.toDouble(),
                    proceedCount = resp.totalSessionsAnalyzed,
                    cautionCount = resp.warningDaysCount,
                    moveIndoorsCount = resp.totalIndoorHours,
                    overridesCount = 0,
                    measuredRatioPct = 100
                )
            } catch (_: Exception) {
                _analyticsData.value = SchoolAnalyticsSummary(
                weekLabelBn = if (_isBengali.value) "তথ্য অনুপলব্ধ" else "Telemetry Unavailable",
                weekLabelEn = "Telemetry Unavailable",
                lostOutdoorMinutes = 0,
                prevWeekLostMinutes = 0,
                hoursAboveThreshold = 0.0,
                proceedCount = 0,
                cautionCount = 0,
                moveIndoorsCount = 0,
                overridesCount = 0,
                measuredRatioPct = 0
            )
            }
        }
    }

    fun loadStaff(schoolId: String) {
        viewModelScope.launch {
            try {
                val resp = AirSafeApiClient.service.getStaff(schoolId)
                if (resp.staff.isNotEmpty()) {
                    _invitedStaff.value = resp.staff.map {
                        StaffItem(
                            email = it.email,
                            roleBn = it.roleBn ?: "শিক্ষক",
                            roleEn = it.roleEn ?: "Teacher"
                        )
                    }
                } else {
                    _invitedStaff.value = emptyList()
                }
            } catch (_: Exception) {
                _invitedStaff.value = emptyList()
            }
        }
    }

    private fun buildFailClosedUnknown(schoolId: String): DecisionResponse {
        val schoolNameBn = _userSession.value?.schoolNameBn ?: "ঢাকা মডেল স্কুল"
        val schoolNameEn = _userSession.value?.schoolNameEn ?: "Dhaka Model School"
        val reason = if (_isBengali.value) {
            "সেন্সর বা আবহাওয়া ডেটা পাওয়া যায়নি — অনুগ্রহ করে কোঅর্ডিনেটরের সাথে যোগাযোগ করুন (Data unavailable — fail-closed)"
        } else {
            "Sensor or weather telemetry unavailable — fail-closed per Policy v1.2. Please contact your coordinator."
        }
        return DecisionResponse(
            schoolId = schoolId,
            schoolName = "$schoolNameBn ($schoolNameEn)",
            status = "UNKNOWN",
            decision = "UNKNOWN",
            policyFloorDecision = "UNKNOWN",
            heatIndexC = null,
            aqi = null,
            pm25Ugm3 = null,
            primaryReason = reason,
            reasons = listOf(reason),
            maxDurationMinutes = null,
            requiresShade = true,
            isStale = true,
            isModeled = true,
            lastUpdated = null,
            routineIntensity = currentRoutineIntensity
        )
    }

    private fun loadDemoSensorSites() {
        _sensorSites.value = listOf(
            SensorSite(
                id = "dhk-001-field",
                nameBn = "[ডেমো ডেটা] খেলার মাঠ",
                nameEn = "[Demo Data] School Playground",
                locationType = "FIELD",
                tempC = 31.5,
                rhPct = 68.0,
                pm25Ugm3 = 42.0,
                heatIndexC = 36.2,
                isOnline = true,
                lastUpdatedBn = "১ মিনিট আগে",
                lastUpdatedEn = "1 min ago"
            ),
            SensorSite(
                id = "dhk-001-courtyard",
                nameBn = "[ডেমো ডেটা] স্কুল উঠান",
                nameEn = "[Demo Data] School Courtyard",
                locationType = "COURTYARD",
                tempC = 29.8,
                rhPct = 70.0,
                pm25Ugm3 = 38.5,
                heatIndexC = 33.1,
                isOnline = true,
                lastUpdatedBn = "৩ মিনিট আগে",
                lastUpdatedEn = "3 mins ago"
            ),
            SensorSite(
                id = "dhk-001-classroom-101",
                nameBn = "[ডেমো ডেটা] ক্লাসরুম ১০১",
                nameEn = "[Demo Data] Classroom 101",
                locationType = "CLASSROOM",
                tempC = 26.5,
                rhPct = 55.0,
                pm25Ugm3 = 18.0,
                heatIndexC = 27.0,
                isOnline = true,
                lastUpdatedBn = "২ মিনিট আগে",
                lastUpdatedEn = "2 mins ago"
            )
        )
    }

    private fun loadDemoTrends() {
        _trendData.value = listOf(
            TrendPoint("[ডেমো] সকাল ৮:০০", "[Demo] 8:00 AM", 27.2, 45, false),
            TrendPoint("[ডেমো] সকাল ৯:০০", "[Demo] 9:00 AM", 29.5, 52, false),
            TrendPoint("[ডেমো] সকাল ১০:০০", "[Demo] 10:00 AM", 32.1, 78, false),
            TrendPoint("[ডেমো] সকাল ১১:০০", "[Demo] 11:00 AM", 35.8, 115, true),
            TrendPoint("[ডেমো] দুপুর ১২:০০", "[Demo] 12:00 PM", 38.4, 142, true),
            TrendPoint("[ডেমো] দুপুর ১:০০", "[Demo] 1:00 PM", 40.2, 158, true),
            TrendPoint("[ডেমো] দুপুর ২:০০", "[Demo] 2:00 PM", 39.5, 150, true),
            TrendPoint("[ডেমো] বিকেল ৩:০০", "[Demo] 3:00 PM", 36.0, 110, true),
            TrendPoint("[ডেমো] বিকেল ৪:০০", "[Demo] 4:00 PM", 32.8, 85, false)
        )
    }

    private fun loadDemoAnalytics() {
        _analyticsData.value = SchoolAnalyticsSummary(
            weekLabelBn = "[ডেমো ডেটা] গত সপ্তাহ (৭–১৩ অক্টোবর)",
            weekLabelEn = "[Demo Data] Past Week (Oct 7–13)",
            lostOutdoorMinutes = 240,
            prevWeekLostMinutes = 360,
            hoursAboveThreshold = 14.5,
            proceedCount = 18,
            cautionCount = 8,
            moveIndoorsCount = 4,
            overridesCount = 2,
            measuredRatioPct = 85
        )
    }

    private fun loadDemoStaff() {
        _invitedStaff.value = listOf(
            StaffItem("fatema.teacher@dms.edu.bd", "[ডেমো ডেটা] শিক্ষক", "[Demo Data] Teacher"),
            StaffItem("karim.teacher@dms.edu.bd", "[ডেমো ডেটা] শিক্ষক", "[Demo Data] Teacher")
        )
    }
}

data class StaffItem(
    val email: String,
    val roleBn: String,
    val roleEn: String
)
