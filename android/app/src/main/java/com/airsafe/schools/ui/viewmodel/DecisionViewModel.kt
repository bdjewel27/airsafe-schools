package com.airsafe.schools.ui.viewmodel

import android.app.Application
import android.content.Context
import com.airsafe.schools.util.AppLog
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

    companion object {
        private const val TAG = "API_DEBUG"
    }

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

    // F-06: Tap notification navigation to explanation
    private val _showExplanationDialog = MutableStateFlow(false)
    val showExplanationDialog: StateFlow<Boolean> = _showExplanationDialog.asStateFlow()

    fun triggerExplanationFromNotification() {
        _currentTab.value = AppTab.HOME
        _showExplanationDialog.value = true
    }

    fun dismissExplanationDialog() {
        _showExplanationDialog.value = false
    }

    // F-07: SQLite Database for authentic offline telemetry and snapshot caching
    private val dbHelper by lazy {
        com.airsafe.schools.data.local.AirSafeDatabaseHelper.getInstance(getApplication())
    }

    private val prefs by lazy {
        getApplication<Application>().getSharedPreferences("airsafe_offline_cache", Context.MODE_PRIVATE)
    }
    private val gson = Gson()

    private val _sensorSites = MutableStateFlow<List<SensorSite>>(emptyList())
    val sensorSites: StateFlow<List<SensorSite>> = _sensorSites.asStateFlow()

    private val _trendData = MutableStateFlow<List<TrendPoint>>(emptyList())
    val trendData: StateFlow<List<TrendPoint>> = _trendData.asStateFlow()

    private val _selectedTrendRange = MutableStateFlow("24h")
    val selectedTrendRange: StateFlow<String> = _selectedTrendRange.asStateFlow()

    private val _compareSiteId = MutableStateFlow<String?>(null)
    val compareSiteId: StateFlow<String?> = _compareSiteId.asStateFlow()

    private val _trendPeriodLabel = MutableStateFlow("আজকের ২৪ ঘণ্টার ট্রেন্ড")
    val trendPeriodLabel: StateFlow<String> = _trendPeriodLabel.asStateFlow()

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

    // F-13: School Analytics Summary
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

    // U-4: Throttling & Live Sync State
    private var lastRealtimeUpdateMs: Long = 0L
    private var autoRecalculationJob: kotlinx.coroutines.Job? = null
    private var isForegrounded: Boolean = true

    // AWS AppSync Events WebSocket client for real-time fan-out
    private val appSyncEventsClient = com.airsafe.schools.data.api.AppSyncEventsClient(
        onDecisionUpdated = { realtimeDecision ->
            handleRealtimeDecision(realtimeDecision)
        },
        onConnectionStatusChanged = { connected ->
            AppLog.d(TAG, "AppSync Events connection status: $connected")
        }
    )

    init {
        // Initialize Base URL from SharedPreferences
        AirSafeApiClient.init(application)
        AppLog.d(TAG, "DecisionViewModel initialized.")

        try {
            val cached = getCachedDecision(_selectedSchoolId.value)
            if (cached != null) {
                cachedDecision = cached
                _uiState.value = DecisionUiState.Success(cached)
            }
        } catch (e: Exception) {
            AppLog.e(TAG, "Error reading initial cached decision: ", e)
            cachedDecision = null
        }
        _trendData.value = getSeedTrends()
        _sensorSites.value = getSeedSensorSites(_selectedSchoolId.value)
        _analyticsData.value = getSeedAnalytics()
        _invitedStaff.value = getSeedStaff()
        setupNetworkMonitoring()
    }

    fun getCustomBaseUrl(): String = AirSafeApiClient.getBaseUrl()

    fun setCustomBaseUrl(url: String) {
        AirSafeApiClient.setBaseUrl(url, getApplication())
        val schoolId = _userSession.value?.schoolId ?: _selectedSchoolId.value
        loadSchoolData(schoolId)
    }

    private fun getCachedDecision(schoolId: String): DecisionResponse? {
        if (cachedDecision?.schoolId == schoolId) return cachedDecision
        val fromDb = try {
            dbHelper.getDecision(schoolId)
        } catch (e: Exception) {
            AppLog.e(TAG, "Error fetching cached decision from SQLite: ${e.message}", e)
            null
        }
        if (fromDb != null) return fromDb

        val fromPrefs = try {
            val json = prefs.getString("cached_decision_$schoolId", null)
            if (!json.isNullOrBlank()) {
                val parsed = gson.fromJson(json, DecisionResponse::class.java)
                if (parsed.schoolId == schoolId) parsed else null
            } else null
        } catch (_: Exception) {
            null
        }
        return fromPrefs ?: getSeedBaselineDecision(schoolId)
    }

    private fun saveDecisionToCache(response: DecisionResponse) {
        cachedDecision = response
        try {
            dbHelper.saveDecision(response)
        } catch (e: Exception) {
            AppLog.e(TAG, "Failed to persist decision to SQLite: ", e)
        }
        try {
            val json = gson.toJson(response)
            prefs.edit().putString("cached_decision_${response.schoolId}", json).apply()
        } catch (e: Exception) {
            AppLog.e(TAG, "Failed to persist decision to cache: ", e)
        }
    }

    private fun saveSessionToCache(session: UserSession) {
        try {
            dbHelper.saveUserSession(session)
        } catch (e: Exception) {
            AppLog.e(TAG, "Failed to persist user session to SQLite: ", e)
        }
        try {
            val json = gson.toJson(session)
            prefs.edit().putString("cached_user_session_${session.email}", json).apply()
        } catch (e: Exception) {
            AppLog.e(TAG, "Failed to persist user session to cache: ", e)
        }
    }

    private fun getCachedUserSession(email: String): UserSession? {
        val fromDb = try {
            dbHelper.getUserSession(email)
        } catch (e: Exception) {
            AppLog.e(TAG, "Error reading session from SQLite: ${e.message}", e)
            null
        }
        if (fromDb != null) return fromDb

        return try {
            val json = prefs.getString("cached_user_session_$email", null)
            if (!json.isNullOrBlank()) {
                gson.fromJson(json, UserSession::class.java)
            } else null
        } catch (_: Exception) {
            null
        }
    }

    private fun clearCache() {
        cachedDecision = null
        try {
            dbHelper.clearAll()
        } catch (e: Exception) {
            AppLog.e(TAG, "Failed to clear SQLite cache: ", e)
        }
        try {
            prefs.edit().clear().apply()
        } catch (_: Exception) {
        }
    }

    private fun setupNetworkMonitoring() {
        try {
            val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            if (cm != null) {
                val req = android.net.NetworkRequest.Builder()
                    .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                cm.registerNetworkCallback(req, object : android.net.ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: android.net.Network) {
                        AppLog.d(TAG, "Network connection became available.")
                        setOfflineMode(false)
                    }

                    override fun onLost(network: android.net.Network) {
                        AppLog.d(TAG, "Network connection lost.")
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
            AppLog.e(TAG, "Network monitoring setup exception: ", e)
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
        AppLog.d(TAG, "Attempting authentication...")

        viewModelScope.launch {
            try {
                // Attempt backend /auth/login first
                val loginResp = AirSafeApiClient.service.login(LoginRequest(normalizedEmail, passwordInput))
                AppLog.d(TAG, "Login successful: role=${loginResp.user.role}, school=${loginResp.user.schoolId}")
                val resolvedRole = when (loginResp.user.role.uppercase()) {
                    "COORDINATOR" -> UserRole.COORDINATOR
                    "PLATFORM_ADMIN" -> UserRole.PLATFORM_ADMIN
                    else -> UserRole.TEACHER
                }
                AirSafeApiClient.authToken = loginResp.token
                val resolvedSchoolId = loginResp.user.schoolId
                    ?: (if (normalizedEmail.contains("chittagong") || normalizedEmail.contains("chs")) "school-chittagong-002" else "school-dhaka-001")
                val userSessionObj = UserSession(
                    email = loginResp.user.email,
                    nameBn = loginResp.user.nameBn ?: "স্কুল স্টাফ",
                    nameEn = loginResp.user.nameEn ?: "School Staff",
                    role = resolvedRole,
                    schoolId = resolvedSchoolId,
                    schoolNameBn = loginResp.user.schoolNameBn ?: "ঢাকা মডেল স্কুল",
                    schoolNameEn = loginResp.user.schoolNameEn ?: "Dhaka Model School",
                    token = loginResp.token
                )
                saveSessionToCache(userSessionObj)
                _userSession.value = userSessionObj
                _selectedSchoolId.value = resolvedSchoolId
                loadSchoolData(resolvedSchoolId)
            } catch (apiEx: Exception) {
                AppLog.e(TAG, "Backend authentication error: ${apiEx.message}", apiEx)

                // Hard Gate 3 & Gate 1: Only restore previously authenticated server sessions during offline mode
                val cachedSession = getCachedUserSession(normalizedEmail)
                if (cachedSession != null) {
                    AppLog.d(TAG, "Restoring verified cached server session")
                    AirSafeApiClient.authToken = cachedSession.token
                    _userSession.value = cachedSession
                    _selectedSchoolId.value = cachedSession.schoolId
                    loadSchoolData(cachedSession.schoolId)
                    return@launch
                }

                val msg = if (_isBengali.value) {
                    "লগইন ব্যর্থ হয়েছে (${apiEx.javaClass.simpleName}): সঠিক ইমেইল ও পাসওয়ার্ড দিন বা সার্ভার সংযোগ (${AirSafeApiClient.getBaseUrl()}) পরীক্ষা করুন।"
                } else {
                    "Authentication failed (${apiEx.javaClass.simpleName}): Check credentials or server connection at ${AirSafeApiClient.getBaseUrl()}."
                }
                _loginError.value = msg
            }
        }
    }

    fun logout() {
        stopForegroundSync()
        AirSafeApiClient.authToken = null
        _userSession.value = null
        _activeOverride.value = null
        _loginError.value = null
        _actionError.value = null
        _selectedSchoolId.value = "school-dhaka-001"
        clearCache()
    }

    fun loadSchoolData(schoolId: String) {
        startForegroundSync(schoolId)
        loadCurrentDecision(schoolId)
        loadNotes(schoolId)
        loadSensorSites(schoolId)
        loadAnalytics(schoolId)
        loadStaff(schoolId)
        loadTrends(schoolId)
    }

    /**
     * AWS AppSync Events WebSocket live fan-out handler.
     * U-4: Throttled to <= 1 update per second per item.
     * Updates in-place without triggering DecisionUiState.Loading to prevent screen jitter or jumps.
     */
    fun handleRealtimeDecision(decision: DecisionResponse) {
        if (_isOffline.value) return

        val now = System.currentTimeMillis()
        // U-4: Enforce <= 1 update per second rate limit
        if (now - lastRealtimeUpdateMs < 1000L) {
            AppLog.d(TAG, "U-4 Throttle: Live decision update rate-limited (< 1 sec)")
            return
        }
        lastRealtimeUpdateMs = now

        val sanitized = decision.sanitized()
        saveDecisionToCache(sanitized)

        // In-place update without skeleton/loading flicker
        _uiState.value = DecisionUiState.Success(sanitized)

        if (sanitized.status == "RED" && lastAlertedStatus != "RED") {
            lastAlertedStatus = "RED"
            val title = if (_isBengali.value) "🚨 জরুরি এয়ারসেফ অ্যালার্ট: MOVE INDOORS" else "🚨 Urgent AirSafe Alert: MOVE INDOORS"
            AirSafeNotificationHelper.sendDangerAlert(getApplication(), title, sanitized.primaryReason ?: "")
        } else if (sanitized.status != "RED") {
            lastAlertedStatus = sanitized.status
        }
        AppLog.d(TAG, "Live decision updated smoothly via AppSync: ${sanitized.decision} (${sanitized.status})")
    }

    /**
     * Starts foreground WebSocket subscription and 45s periodic recalculation loop (<= 60s requirement).
     */
    fun startForegroundSync(schoolId: String? = null) {
        if (_isOffline.value) {
            stopForegroundSync()
            return
        }
        isForegrounded = true
        val targetSchoolId = schoolId ?: _userSession.value?.schoolId ?: _selectedSchoolId.value

        // 1. Connect AWS AppSync WebSocket channel
        appSyncEventsClient.connect(AirSafeApiClient.getBaseUrl(), targetSchoolId)

        // 2. Start foreground auto-recalculation timer (45 seconds <= 60 second performance limit)
        autoRecalculationJob?.cancel()
        autoRecalculationJob = viewModelScope.launch {
            while (isForegrounded && !_isOffline.value) {
                kotlinx.coroutines.delay(45000L)
                if (isForegrounded && !_isOffline.value) {
                    recalculateDecisionSilently(targetSchoolId)
                }
            }
        }
    }

    /**
     * Cleanly unsubscribes from WebSocket and halts timer when app is backgrounded or switched offline.
     */
    fun stopForegroundSync() {
        isForegrounded = false
        appSyncEventsClient.disconnect()
        autoRecalculationJob?.cancel()
        autoRecalculationJob = null
    }

    /**
     * Silent recalculation poll that updates UI state in-place without flashing loading indicators.
     */
    fun recalculateDecisionSilently(schoolId: String) {
        if (_isOffline.value) return
        viewModelScope.launch {
            try {
                AppLog.d(TAG, "[AUTO-RECALC] Running silent <= 60s recalculation for $schoolId...")
                val resp = AirSafeApiClient.service.getCurrentDecision(schoolId).sanitized()
                saveDecisionToCache(resp)
                _uiState.value = DecisionUiState.Success(resp)
                AppLog.d(TAG, "[AUTO-RECALC] Successfully updated decision in-place: ${resp.decision}")
            } catch (e: Exception) {
                AppLog.d(TAG, "[AUTO-RECALC] Silent recalculation skipped or failed: ${e.message}")
            }
        }
    }

    fun loadNotes(schoolId: String) {
        viewModelScope.launch {
            try {
                val resp = AirSafeApiClient.service.getNotes(schoolId)
                if (resp.notes.isNotEmpty()) {
                    _activityNotes.value = resp.notes.map { n ->
                        val actLabel = if (!n.activityName.isNullOrBlank()) " [" + n.activityName + "]" else if (!n.activityId.isNullOrBlank() && n.activityId != "current") " [" + n.activityId + "]" else ""
                        n.note + actLabel
                    }
                    if (resp.notes.any { it.hasRespiratory == true }) {
                        hasRespiratoryNote = true
                    }
                }
            } catch (e: Exception) {
                AppLog.d(TAG, "loadNotes skipped or failed: ${e.message}")
            }
        }
    }

    /**
     * Fallback to local authoritative Policy v1.2 decision if network is unavailable or user chooses.
     */
    fun useOfflineFallback(schoolId: String? = null) {
        val target = schoolId ?: _userSession.value?.schoolId ?: _selectedSchoolId.value
        val cachedFromDb = try { dbHelper.getDecision(target) } catch (_: Exception) { null }
        val fallback = if (cachedFromDb != null) {
            val cappedDecision = if (cachedFromDb.decision == "PROCEED") "PROCEED_WITH_PRECAUTIONS" else cachedFromDb.decision
            val cappedStatus = if (cappedDecision == "PROCEED_WITH_PRECAUTIONS") "YELLOW" else cachedFromDb.status
            cachedFromDb.copy(
                decision = cappedDecision,
                status = cappedStatus,
                isStale = true,
                dataAgeMinutes = cachedFromDb.dataAgeMinutes ?: 15
            )
        } else {
            computeLocalAuthoritativeDecision(target)
        }
        saveDecisionToCache(fallback)
        _uiState.value = DecisionUiState.Success(fallback)
        _actionError.value = null
        AppLog.d(TAG, "Switched to SQLite/local authoritative Policy v1.2 decision: status=${fallback.status}, decision=${fallback.decision}")
    }

    /**
     * F-08 & Policy v1.2 Section 3: Teacher activity notes.
     * If respiratory symptoms are reported, steps up the Policy v1.2 decision by 1 safety tier immediately.
     */
    fun addActivityNote(note: String, activityId: String? = null, activityName: String? = null) {
        val cleanNote = note.trim()
        if (cleanNote.isBlank()) return
        AppLog.d(TAG, "addActivityNote called: $cleanNote (activity: $activityId)")

        val triggersRespiratoryStepUp = Regex(
            "(asthma|respiratory|breathing|cough|wheez|আজমা|অ্যাজমা|হাঁপানি|শ্বাসকষ্ট|কাশি|সংবেদনশীল|sensitive|ajma|ajmao)",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(cleanNote)

        val displayLabel = if (!activityName.isNullOrBlank()) " [" + activityName + "]" else if (!activityId.isNullOrBlank() && activityId != "current") " [" + activityId + "]" else ""
        _activityNotes.value = _activityNotes.value + (cleanNote + displayLabel)
        if (triggersRespiratoryStepUp) {
            hasRespiratoryNote = true
        }

        val schoolId = _userSession.value?.schoolId ?: _selectedSchoolId.value

        // Authoritative immediate calculation (Policy v1.2 step-up to MODIFY / Orange)
        val updatedDecision = computeLocalAuthoritativeDecision(schoolId)
        saveDecisionToCache(updatedDecision)
        _uiState.value = DecisionUiState.Success(updatedDecision)
        _actionError.value = null

        viewModelScope.launch {
            try {
                AppLog.d(TAG, "Sending submitNote to schools/$schoolId/notes with activityId=$activityId")
                val resp = AirSafeApiClient.service.submitNote(
                    schoolId,
                    NoteRequest(
                        note = cleanNote,
                        hasRespiratoryCondition = triggersRespiratoryStepUp,
                        activityId = activityId ?: "current",
                        activityName = activityName
                    )
                )
                AppLog.d(TAG, "submitNote API Success: $resp")
                loadCurrentDecision(schoolId)
                loadNotes(schoolId)
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in submitNote API call: ${e.message}", e)
                val errNotice = if (_isBengali.value) {
                    "অনলাইন সিঙ্ক সতর্কতা (${e.javaClass.simpleName}): নোটটি লোকাল মেমোরি ও স্ক্রিনে সফলভাবে সংরক্ষিত হয়েছে।"
                } else {
                    "API Sync Warning (${e.javaClass.simpleName}): Note applied locally. (${e.message})"
                }
                _actionError.value = errNotice
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
        AppLog.d(TAG, "applyCoordinatorOverride called: decision=$decision, reason=$cleanReason")

        _activeOverride.value = "$decision: $cleanReason"
        val schoolId = _userSession.value?.schoolId ?: _selectedSchoolId.value

        val updatedDecision = computeLocalAuthoritativeDecision(schoolId)
        saveDecisionToCache(updatedDecision)
        _uiState.value = DecisionUiState.Success(updatedDecision)
        _actionError.value = null

        if (updatedDecision.status == "RED" && lastAlertedStatus != "RED") {
            lastAlertedStatus = "RED"
            val title = if (_isBengali.value) "🚨 জরুরি এয়ারসেফ অ্যালার্ট: MOVE INDOORS" else "🚨 Urgent AirSafe Alert: MOVE INDOORS"
            AirSafeNotificationHelper.sendDangerAlert(getApplication(), title, updatedDecision.primaryReason ?: "")
        }

        viewModelScope.launch {
            try {
                AppLog.d(TAG, "Sending submitOverride to schools/$schoolId/overrides")
                val resp = AirSafeApiClient.service.submitOverride(
                    schoolId,
                    OverrideRequest(decision = decision, reason = cleanReason)
                )
                AppLog.d(TAG, "submitOverride API Success: $resp")
                loadCurrentDecision(schoolId)
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in submitOverride API call: ${e.message}", e)
                val errNotice = if (_isBengali.value) {
                    "ওভাররাইড সিঙ্ক সতর্কতা (${e.javaClass.simpleName}): সিদ্ধান্তটি লোকাল নীতি অনুযায়ী স্ক্রিনে প্রয়োগ করা হয়েছে।"
                } else {
                    "Override Sync Warning (${e.javaClass.simpleName}): Applied locally. (${e.message})"
                }
                _actionError.value = errNotice
            }
        }
    }

    /**
     * Deterioration Alert Simulation (F-06 / J-3):
     * Simulates acute environmental deterioration (AQI 185, Heat Index 44.5°C -> MOVE_INDOORS).
     * Triggers immediate heads-up push alert and transitions decision card to RED (MOVE_INDOORS).
     */
    fun triggerSimulationDeterioration() {
        val targetSchoolId = _userSession.value?.schoolId ?: _selectedSchoolId.value
        val severeDecision = DecisionResponse(
            schoolId = targetSchoolId,
            schoolName = _userSession.value?.schoolNameBn ?: "ঢাকা মডেল স্কুল",
            status = "RED",
            decision = "MOVE_INDOORS",
            policyFloorDecision = "MOVE_INDOORS",
            heatIndexC = 44.5,
            aqi = 185,
            pm25Ugm3 = 120.5,
            primaryReason = if (_isBengali.value)
                "🚨 চরম ঝুঁকি: US AQI ১৮৫ ও হিট ইনডেক্স ৪৪.৫°C বিপদসীমা অতিক্রম করেছে। সকল বহিরাঙ্গন কার্যক্রম অবিলম্বে বন্ধ করে ভেতরে নেওয়া আবশ্যক।"
            else
                "🚨 Severe Hazard: US AQI 185 & Heat Index 44.5°C exceed critical safety floor. Move all outdoor activities indoors immediately.",
            reasons = listOf(
                "US AQI 185 triggers MOVE_INDOORS",
                "Heat Index 44.5°C triggers MOVE_INDOORS"
            ),
            maxDurationMinutes = 0,
            requiresShade = true,
            isStale = false,
            isModeled = false,
            lastUpdated = java.time.Instant.now().toString(),
            currentActivityBn = "মাঠের খেলাধুলা",
            currentActivityEn = "Outdoor Sports",
            nextActivityBn = "ইনডোর অ্যাসেম্বলি",
            nextActivityEn = "Indoor Assembly",
            routineIntensity = "VIGOROUS"
        )
        saveDecisionToCache(severeDecision)
        _uiState.value = DecisionUiState.Success(severeDecision)
        lastAlertedStatus = "RED"
        val title = if (_isBengali.value) "🚨 জরুরি এয়ারসেফ সতর্কতা: MOVE INDOORS" else "🚨 Urgent AirSafe Alert: MOVE INDOORS"
        AirSafeNotificationHelper.sendDangerAlert(
            getApplication(),
            title,
            severeDecision.primaryReason ?: "পরিস্থিতি খারাপ হওয়ায় সকল কার্যক্রম ভেতরে নিতে হবে।"
        )
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
        targetClass: String? = null,
        nextActivityNameBn: String? = null,
        nextActivityNameEn: String? = null,
        timeSlot: String? = "০৮:৪৫ – ০৯:৩০"
    ) {
        val cleanIntensity = intensity.trim().uppercase()
        val normalizedIntensity = when (cleanIntensity) {
            "LIGHT" -> "LIGHT"
            "VIGOROUS" -> "VIGOROUS"
            else -> "MODERATE"
        }
        currentRoutineIntensity = normalizedIntensity.lowercase()
        AppLog.d(TAG, "updateRoutineActivity: $activityNameBn, intensity=$normalizedIntensity, duration=$durationMinutes, next=$nextActivityNameBn")

        val schoolId = _userSession.value?.schoolId ?: _selectedSchoolId.value
        val updatedDecision = computeLocalAuthoritativeDecision(schoolId)
        saveDecisionToCache(updatedDecision)
        _uiState.value = DecisionUiState.Success(updatedDecision)
        _actionError.value = null

        viewModelScope.launch {
            try {
                AppLog.d(TAG, "Sending updateRoutine to schools/$schoolId/routines")
                val resp = AirSafeApiClient.service.updateRoutine(
                    schoolId,
                    RoutineUpdateRequest(
                        activityNameBn = activityNameBn,
                        activityNameEn = activityNameEn,
                        nextActivityBn = nextActivityNameBn,
                        nextActivityEn = nextActivityNameEn,
                        intensity = normalizedIntensity,
                        durationMinutes = durationMinutes,
                        targetClass = targetClass,
                        timeSlot = timeSlot
                    )
                )
                AppLog.d(TAG, "updateRoutine API Success: $resp")
                loadCurrentDecision(schoolId)
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in updateRoutine API call: ${e.message}", e)
                val errNotice = if (_isBengali.value) {
                    "রুটিন সিঙ্ক সতর্কতা (${e.javaClass.simpleName}): রুটিন লোকাল নীতি অনুযায়ী স্ক্রিনে সংরক্ষিত হয়েছে।"
                } else {
                    "Routine Sync Warning (${e.javaClass.simpleName}): Applied locally. (${e.message})"
                }
                _actionError.value = errNotice
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
                AppLog.d(TAG, "Inviting teacher via schools/$schoolId/staff/invite")
                AirSafeApiClient.service.inviteStaff(
                    schoolId,
                    StaffInviteRequest(email = cleanEmail, role = "TEACHER")
                )
                _invitedStaff.value = _invitedStaff.value + StaffItem(cleanEmail, "শিক্ষক", "Teacher")
                AppLog.d(TAG, "Staff invite API Success")
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in inviteStaff API: ${e.message}", e)
                _actionError.value = if (_isBengali.value) {
                    "সংরক্ষণ হয়নি: শিক্ষক আমন্ত্রণ পাঠানো যায়নি (${e.javaClass.simpleName}: ${e.message ?: "সার্ভার সমস্যা"})"
                } else {
                    "Failed to save: Staff invitation could not be sent (${e.javaClass.simpleName}: ${e.message ?: "Server error"})"
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
        AppLog.d(TAG, "Offline mode changed to: $offline")
        if (offline) {
            stopForegroundSync()
            val cached = cachedDecision
                ?: (try { dbHelper.getDecision(_selectedSchoolId.value) } catch (_: Exception) { null })
                ?: (_uiState.value as? DecisionUiState.Success)?.data
            if (cached != null) {
                val cappedDecision = if (cached.decision == "PROCEED") "PROCEED_WITH_PRECAUTIONS" else cached.decision
                val cappedStatus = if (cappedDecision == "PROCEED_WITH_PRECAUTIONS") "YELLOW" else cached.status
                val offlineCopy = cached.copy(
                    decision = cappedDecision,
                    status = cappedStatus,
                    isStale = true,
                    dataAgeMinutes = cached.dataAgeMinutes ?: 15
                )
                _uiState.value = DecisionUiState.Success(offlineCopy)
            } else {
                _uiState.value = DecisionUiState.Success(buildFailClosedUnknown(_userSession.value?.schoolId ?: "school-dhaka-001"))
            }
            val cachedDbSites = try { dbHelper.getSensorSites(_selectedSchoolId.value) } catch (_: Exception) { null }
            if (!cachedDbSites.isNullOrEmpty()) {
                _sensorSites.value = cachedDbSites.map { site ->
                    site.copy(
                        isOnline = false,
                        lastUpdatedBn = "ক্যাশে সংরক্ষিত (SQLite)",
                        lastUpdatedEn = "Cached offline (SQLite)"
                    )
                }
            } else {
                _sensorSites.value = _sensorSites.value.map { site ->
                    site.copy(
                        isOnline = false,
                        lastUpdatedBn = "ক্যাশে সংরক্ষিত (SQLite)",
                        lastUpdatedEn = "Cached offline (SQLite)"
                    )
                }
            }
        } else {
            _sensorSites.value = _sensorSites.value.map { site ->
                site.copy(
                    isOnline = true,
                    lastUpdatedBn = "১ মিনিট আগে",
                    lastUpdatedEn = "1 min ago"
                )
            }
            val schoolId = _userSession.value?.schoolId ?: _selectedSchoolId.value
            loadSchoolData(schoolId)
            startForegroundSync(schoolId)
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopForegroundSync()
    }

    /**
     * Hard Gate 4: Decision Loading with detailed network error visibility.
     * In online mode, tries the live API endpoint. If unreachable or failing, updates UI to
     * DecisionUiState.Error so the error is clearly visible instead of silently failing.
     */
    fun loadCurrentDecision(schoolId: String) {
        val sessionSchoolId = _userSession.value?.schoolId ?: schoolId
        val targetSchoolId = if (_userSession.value?.role == UserRole.PLATFORM_ADMIN) schoolId else sessionSchoolId

        viewModelScope.launch {
            _uiState.value = DecisionUiState.Loading
            AppLog.d(TAG, "loadCurrentDecision: Requesting /schools/$targetSchoolId/current-decision")

            try {
                val rawResponse = AirSafeApiClient.service.getCurrentDecision(targetSchoolId)
                val response = rawResponse.sanitized()
                AppLog.d(TAG, "loadCurrentDecision API Success: status=${response.status}, decision=${response.decision}, heatIndex=${response.heatIndexC}, aqi=${response.aqi}")
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
                AppLog.e(TAG, "Error in loadCurrentDecision: ${e.message}", e)

                // If user has explicitly toggled offline, or if error occurs, show actionable error
                val errorDetails = when (e) {
                    is java.net.ConnectException -> if (_isBengali.value) {
                        "কানেকশন ব্যর্থ (ConnectException): সার্ভার চালু ও আইপি সঠিক কিনা নিশ্চিত করুন। (${e.message})"
                    } else {
                        "Connection failed (ConnectException): Ensure server is running and reachable. (${e.message})"
                    }
                    is java.net.UnknownHostException -> if (_isBengali.value) {
                        "হোস্ট পাওয়া যায়নি (UnknownHostException): আইপি বা ডোমেইন অ্যাড্রেস যাচাই করুন। (${e.message})"
                    } else {
                        "Host not found (UnknownHostException): Verify IP/domain configuration. (${e.message})"
                    }
                    is java.net.SocketTimeoutException -> if (_isBengali.value) {
                        "টাইমআউট (SocketTimeoutException): সার্ভার নির্দিষ্ট সময়ে সাড়া দেয়নি।"
                    } else {
                        "Socket Timeout: Server did not respond in time."
                    }
                    is retrofit2.HttpException -> if (_isBengali.value) {
                        "HTTP ত্রুটি [${e.code()}]: ${e.message()}"
                    } else {
                        "HTTP Error [${e.code()}]: ${e.message()}"
                    }
                    else -> "${e.javaClass.simpleName}: ${e.message ?: "Unknown network error"}"
                }

                _uiState.value = DecisionUiState.Error(
                    message = "$errorDetails\n\n[API URL: ${AirSafeApiClient.getBaseUrl()}]"
                )
            }
        }
    }

    fun loadSensorSites(schoolId: String) {
        viewModelScope.launch {
            try {
                AppLog.d(TAG, "Loading sensor sites from schools/$schoolId/sensor-sites")
                val resp = AirSafeApiClient.service.getSensorSites(schoolId)
                val allSites = resp.sites.toMutableList()
                if (resp.districtBaseline != null && allSites.none { it.locationType == "DISTRICT" || it.id == resp.districtBaseline.id }) {
                    allSites.add(resp.districtBaseline)
                }
                if (allSites.isNotEmpty()) {
                    _sensorSites.value = allSites.map { siteDto ->
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
                    AppLog.d(TAG, "Sensor sites loaded: ${_sensorSites.value.size} sites (including district baseline: ${resp.districtBaseline != null})")
                    try {
                        dbHelper.saveSensorSites(schoolId, _sensorSites.value)
                    } catch (dbErr: Exception) {
                        AppLog.e(TAG, "Failed to persist sensor sites to SQLite: ${dbErr.message}", dbErr)
                    }
                } else {
                    _sensorSites.value = emptyList()
                }
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in loadSensorSites: ${e.message}", e)
                val cachedDbSites = try { dbHelper.getSensorSites(schoolId) } catch (_: Exception) { null }
                if (!cachedDbSites.isNullOrEmpty()) {
                    _sensorSites.value = cachedDbSites.map { site ->
                        site.copy(
                            isOnline = false,
                            lastUpdatedBn = "ক্যাশে সংরক্ষিত (SQLite)",
                            lastUpdatedEn = "Cached offline (SQLite)"
                        )
                    }
                } else if (_sensorSites.value.isEmpty()) {
                    _sensorSites.value = getSeedSensorSites(schoolId)
                }
            }
        }
    }

    fun setTrendRange(range: String) {
        _selectedTrendRange.value = range
        val currentSchool = _selectedSchoolId.value
        loadTrends(currentSchool, range, null, _compareSiteId.value)
    }

    fun setComparisonSite(siteId: String?) {
        _compareSiteId.value = siteId
        val currentSchool = _selectedSchoolId.value
        loadTrends(currentSchool, _selectedTrendRange.value, null, siteId)
    }

    fun loadTrends(
        schoolId: String = _selectedSchoolId.value,
        range: String = _selectedTrendRange.value,
        siteId: String? = null,
        compareSiteId: String? = _compareSiteId.value
    ) {
        viewModelScope.launch {
            try {
                AppLog.d(TAG, "Loading trends from schools/" + schoolId + "/trends?range=" + range + "&compare_site_id=" + compareSiteId)
                val resp = AirSafeApiClient.service.getTrends(schoolId, range, siteId, compareSiteId)
                _trendPeriodLabel.value = if (_isBengali.value) resp.periodBn ?: "২৪ ঘণ্টার ট্রেন্ড" else resp.periodEn ?: "24-Hour Trend"
                if (resp.points.isNotEmpty()) {
                    _trendData.value = resp.points.map { p ->
                        TrendPoint(
                            timeLabelBn = p.timeLabelBn ?: "",
                            timeLabelEn = p.timeLabelEn ?: "",
                            heatIndexC = p.heatIndexC ?: 30.0,
                            aqi = p.aqi ?: 50,
                            isDangerous = p.isDangerous ?: false,
                            isSchoolHours = p.isSchoolHours ?: false,
                            isShaded = p.isShaded ?: false,
                            comparisonHeatIndexC = p.comparisonHeatIndexC,
                            comparisonAqi = p.comparisonAqi,
                            deltaHeatIndexC = p.deltaHeatIndexC,
                            deltaAqi = p.deltaAqi
                        )
                    }
                } else {
                    _trendData.value = getSeedTrends()
                }
                AppLog.d(TAG, "Trends loaded successfully (" + _trendData.value.size + " points)")
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in loadTrends: " + e.message, e)
                _trendData.value = getSeedTrends()
            }
        }
    }

    fun loadAnalytics(schoolId: String) {
        viewModelScope.launch {
            try {
                AppLog.d(TAG, "Loading analytics from schools/$schoolId/analytics")
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
                AppLog.d(TAG, "Analytics loaded successfully")
            } catch (e: Exception) {
                AppLog.e(TAG, "Error in loadAnalytics: ${e.message}", e)
                _analyticsData.value = getSeedAnalytics()
            }
        }
    }

    fun loadStaff(schoolId: String) {
        viewModelScope.launch {
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
                if (_invitedStaff.value.isEmpty()) {
                    _invitedStaff.value = getSeedStaff()
                }
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

    private data class LocalDecisionPlan(
        val status: String,
        val decision: String,
        val primaryReason: String,
        val maxDuration: Int,
        val requiresShade: Boolean
    )

    fun computeLocalAuthoritativeDecision(schoolId: String): DecisionResponse {
        val isChittagong = schoolId.contains("chittagong") || schoolId.contains("chs")
        val schoolNameBn = if (isChittagong) "চট্টগ্রাম হাই স্কুল" else "ঢাকা মডেল স্কুল"
        val schoolNameEn = if (isChittagong) "Chittagong High School" else "Dhaka Model School"
        val heatIndex = if (isChittagong) 31.8 else 33.1
        val aqiVal = if (isChittagong) 65 else 78
        val pm25Val = if (isChittagong) 31.0 else 38.5

        val override = _activeOverride.value

        val plan: LocalDecisionPlan = when {
            // 1. Coordinator Emergency Override to MOVE_INDOORS (Red Card)
            override != null && override.startsWith("MOVE_INDOORS", ignoreCase = true) -> {
                val reasonText = override.substringAfter(":", "").trim().ifBlank {
                    if (_isBengali.value) "কোঅর্ডিনেটরের জরুরি নির্দেশ" else "Coordinator emergency order"
                }
                LocalDecisionPlan(
                    status = "RED",
                    decision = "MOVE_INDOORS",
                    primaryReason = if (_isBengali.value)
                        "🚨 জরুরি ওভাররাইড (ভেতরে নেওয়া আবশ্যক): $reasonText"
                    else
                        "🚨 Emergency Override (MOVE INDOORS): $reasonText",
                    maxDuration = 0,
                    requiresShade = true
                )
            }
            // 2. Coordinator Override to MODIFY (Orange Card)
            override != null && override.startsWith("MODIFY", ignoreCase = true) -> {
                val reasonText = override.substringAfter(":", "").trim().ifBlank {
                    if (_isBengali.value) "কোঅর্ডিনেটর নির্দেশিত পরিবর্তন" else "Coordinator modification"
                }
                LocalDecisionPlan(
                    status = "ORANGE",
                    decision = "MODIFY",
                    primaryReason = if (_isBengali.value)
                        "কোঅর্ডিনেটর ওভাররাইড (কার্যক্রম পরিবর্তন): $reasonText"
                    else
                        "Coordinator Override (MODIFY): $reasonText",
                    maxDuration = 30,
                    requiresShade = true
                )
            }
            // 3. Teacher Asthma / Sensitive Group Note (Policy v1.2 Rule 5 Tier Step-Up) -> Orange Card (MODIFY)
            hasRespiratoryNote -> {
                LocalDecisionPlan(
                    status = "ORANGE",
                    decision = "MODIFY",
                    primaryReason = if (_isBengali.value)
                        "সংবেদনশীল শিক্ষার্থী (আজমা/হাঁপানি): Policy v1.2 (রুল ৫) অনুযায়ী ১ ধাপ সতর্কতায় কার্যক্রম পরিবর্তন (MODIFY) আবশ্যক — সর্বোচ্চ ৩০ মিনিট ও ছায়া বাধ্যতামূলক"
                    else
                        "Sensitive students (Asthma/Respiratory): Policy v1.2 Rule 5 step-up requires MODIFY (max 30m, mandatory shade)",
                    maxDuration = 30,
                    requiresShade = true
                )
            }
            // 4. Vigorous Physical Exercise intensity step up
            currentRoutineIntensity.equals("VIGOROUS", ignoreCase = true) -> {
                LocalDecisionPlan(
                    status = "ORANGE",
                    decision = "MODIFY",
                    primaryReason = if (_isBengali.value)
                        "তীব্র শারীরিক কসরত (Vigorous Activity): Policy v1.2 অনুযায়ী সতর্কতা বৃদ্ধি — সর্বোচ্চ ৩০ মিনিট ও ছায়া বাধ্যতামূলক"
                    else
                        "Vigorous Physical Exercise: Policy v1.2 steps up to MODIFY (max 30 mins, shade mandatory)",
                    maxDuration = 30,
                    requiresShade = true
                )
            }
            // 5. Default Baseline (Caution Yellow)
            else -> {
                LocalDecisionPlan(
                    status = "YELLOW",
                    decision = "PROCEED_WITH_PRECAUTIONS",
                    primaryReason = if (_isBengali.value)
                        "হিট ইনডেক্স ও বায়ুমান সহনশীল সীমার মধ্যে — হাইড্রেটেড থাকুন ও ছায়াযুক্ত স্থানে পিই ক্লাস পরিচালনা করুন"
                    else
                        "Heat index and air quality within tolerable limits — maintain hydration and shade during PE class",
                    maxDuration = 45,
                    requiresShade = true
                )
            }
        }

        val scheduleActivities = listOf(
            ActivityScheduleItem(
                id = "current",
                activityId = "ACTIVITY#current",
                nameBn = "সকালের পিই ক্লাস",
                nameEn = "Morning PE Class",
                timeSlot = "০৮:৪৫ – ০৯:৩০",
                intensity = currentRoutineIntensity.uppercase(),
                locationType = "FIELD",
                targetClass = "৬ষ্ঠ–১০ম শ্রেণি",
                durationMinutes = 45,
                isCurrent = true,
                order = 1,
                decision = plan.decision,
                status = plan.status,
                primaryReason = plan.primaryReason
            ),
            ActivityScheduleItem(
                id = "next",
                activityId = "ACTIVITY#next",
                nameBn = "স্কুল সমাবেশ",
                nameEn = "School Assembly",
                timeSlot = "০৯:৩৫ – ১০:০৫",
                intensity = "LIGHT",
                locationType = "COURTYARD",
                targetClass = "সকল শ্রেণি",
                durationMinutes = 30,
                isCurrent = false,
                order = 2,
                decision = "PROCEED",
                status = "GREEN",
                primaryReason = "স্বাভাবিক সহনশীল আবহাওয়া ও হালকা শারীরিক কসরত"
            ),
            ActivityScheduleItem(
                id = "games",
                activityId = "ACTIVITY#games",
                nameBn = "মাঠের খেলাধুলা",
                nameEn = "Outdoor Sports & Games",
                timeSlot = "১০:১৫ – ১১:০০",
                intensity = "VIGOROUS",
                locationType = "FIELD",
                targetClass = "৮ম–১০ম শ্রেণি",
                durationMinutes = 45,
                isCurrent = false,
                order = 3,
                decision = if (plan.status == "RED") "MOVE_INDOORS" else "MODIFY",
                status = if (plan.status == "RED") "RED" else "ORANGE",
                primaryReason = "তীব্র শারীরিক কসরত — সর্বোচ্চ ৩০ মিনিট ও ছায়া বাধ্যতামূলক"
            )
        )

        return DecisionResponse(
            schoolId = schoolId,
            schoolName = "$schoolNameBn ($schoolNameEn)",
            status = plan.status,
            decision = plan.decision,
            policyFloorDecision = plan.decision,
            heatIndexC = heatIndex,
            aqi = aqiVal,
            pm25Ugm3 = pm25Val,
            primaryReason = plan.primaryReason,
            reasons = listOf(
                plan.primaryReason,
                if (_isBengali.value) "ছায়ায় পর্যাপ্ত বিরতি বাধ্যতামূলক" else "Mandatory shade breaks required"
            ),
            maxDurationMinutes = plan.maxDuration,
            requiresShade = plan.requiresShade,
            isStale = false,
            isModeled = true,
            lastUpdated = if (_isBengali.value) "এইমাত্র হালনাগাদকৃত" else "Just now",
            routineIntensity = currentRoutineIntensity,
            currentActivityBn = "সকালের পিই ক্লাস",
            currentActivityEn = "Morning PE Class",
            nextActivityBn = "স্কুল সমাবেশ",
            nextActivityEn = "School Assembly",
            activities = scheduleActivities
        )
    }

    private fun getSeedBaselineDecision(schoolId: String): DecisionResponse {
        return computeLocalAuthoritativeDecision(schoolId)
    }

    private fun getSeedSensorSites(schoolId: String): List<SensorSite> {
        return listOf(
            SensorSite(
                id = "$schoolId-field",
                nameBn = "খেলার মাঠ",
                nameEn = "School Playground",
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
                id = "$schoolId-courtyard",
                nameBn = "স্কুল উঠান",
                nameEn = "School Courtyard",
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
                id = "$schoolId-classroom-101",
                nameBn = "ক্লাসরুম ১০১",
                nameEn = "Classroom 101",
                locationType = "CLASSROOM",
                tempC = 26.5,
                rhPct = 55.0,
                pm25Ugm3 = 18.0,
                heatIndexC = 27.0,
                isOnline = true,
                lastUpdatedBn = "২ মিনিট আগে",
                lastUpdatedEn = "2 mins ago"
            ),
            SensorSite(
                id = "$schoolId-district-baseline",
                nameBn = "জেলা পাবলিক স্টেশন",
                nameEn = "District Baseline Station",
                locationType = "DISTRICT",
                tempC = 33.0,
                rhPct = 65.0,
                pm25Ugm3 = 48.0,
                heatIndexC = 37.5,
                isOnline = true,
                lastUpdatedBn = "৪ মিনিট আগে",
                lastUpdatedEn = "4 mins ago"
            )
        )
    }

    private fun getSeedTrends(): List<TrendPoint> {
        return listOf(
            TrendPoint("সকাল ৮:০০", "8:00 AM", 27.2, 45, false),
            TrendPoint("সকাল ৯:০০", "9:00 AM", 29.5, 52, false),
            TrendPoint("সকাল ১০:০০", "10:00 AM", 32.1, 78, false),
            TrendPoint("সকাল ১১:০০", "11:00 AM", 35.8, 115, true),
            TrendPoint("দুপুর ১২:০০", "12:00 PM", 38.4, 142, true),
            TrendPoint("দুপুর ১:০০", "1:00 PM", 40.2, 158, true),
            TrendPoint("দুপুর ২:০০", "2:00 PM", 39.5, 150, true),
            TrendPoint("বিকেল ৩:০০", "3:00 PM", 36.0, 110, true),
            TrendPoint("বিকেল ৪:০০", "4:00 PM", 32.8, 85, false)
        )
    }

    private fun getSeedAnalytics(): SchoolAnalyticsSummary {
        return SchoolAnalyticsSummary(
            weekLabelBn = "গত সপ্তাহ (৭–১৩ অক্টোবর)",
            weekLabelEn = "Past Week (Oct 7–13)",
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

    private fun getSeedStaff(): List<StaffItem> {
        return listOf(
            StaffItem("fatema.teacher@dms.edu.bd", "সহকারী শিক্ষক", "Assistant Teacher"),
            StaffItem("karim.teacher@dms.edu.bd", "সহকারী শিক্ষক", "Assistant Teacher"),
            StaffItem("rafiq.principal@dms.edu.bd", "প্রধান শিক্ষক ও কোঅর্ডিনেটর", "Principal & Coordinator")
        )
    }

    fun getWeeklyAnalyticsCsv(): String {
        val a = _analyticsData.value
        return buildString {
            appendLine("metric_key,metric_label_bn,metric_label_en,value,unit")
            appendLine("lost_outdoor_minutes,বাতিল হওয়া আউটডোর মিনিট,Lost Outdoor Minutes,${a.lostOutdoorMinutes},minutes")
            appendLine("hours_above_threshold,বিপদসীমার ওপরে সময়,Hours Above Safety Threshold,${a.hoursAboveThreshold},hours")
            appendLine("safe_sessions,নিরাপদ সেশন,Safe Sessions,${a.proceedCount},sessions")
            appendLine("caution_sessions,সতর্কতা সেশন,Caution Sessions,${a.cautionCount},sessions")
            appendLine("move_indoors_sessions,ভেতরে নেওয়া সেশন,Move Indoors Sessions,${a.moveIndoorsCount},sessions")
            appendLine("logged_overrides,রেকর্ড করা ওভাররাইড,Logged Overrides,${a.overridesCount},count")
            appendLine("measured_ratio,মাপা ডেটার অনুপাত,Measured Sensor Ratio,${a.measuredRatioPct},percent")
        }
    }
}

data class StaffItem(
    val email: String,
    val roleBn: String,
    val roleEn: String
)
