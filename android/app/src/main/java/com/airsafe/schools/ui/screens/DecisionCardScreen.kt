package com.airsafe.schools.ui.screens

import com.airsafe.schools.ui.screens.components.*

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.data.model.DecisionUiState
import com.airsafe.schools.data.model.toBengaliDigits
import com.airsafe.schools.data.model.UserRole
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

/**
 * Policy v1.2 Four-Tier Outcome Model + Fail-Closed UNKNOWN state (Hard Gate 4)
 */

@Composable
fun DecisionCardScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val isBengali by viewModel.isBengali.collectAsState()
    val isOffline by viewModel.isOffline.collectAsState()
    val userSession by viewModel.userSession.collectAsState()
    val activeOverride by viewModel.activeOverride.collectAsState()
    val activityNotes by viewModel.activityNotes.collectAsState()
    val actionError by viewModel.actionError.collectAsState()
    val showExplanationDialog by viewModel.showExplanationDialog.collectAsState()
    val scrollState = rememberScrollState()

    var showNoteDialog by remember { mutableStateOf(false) }
    var noteInput by remember { mutableStateOf("") }

    var showOverrideDialog by remember { mutableStateOf(false) }
    var overrideReason by remember { mutableStateOf("") }
    var selectedOverrideDecision by remember { mutableStateOf("MOVE_INDOORS") }
    var overrideValidationError by remember { mutableStateOf<String?>(null) }

    var showRoutineDialog by remember { mutableStateOf(false) }
    var showPolicyDialog by remember { mutableStateOf(false) }
    var routineActivityName by remember { mutableStateOf("সকালের পিই ক্লাস (Morning PE)") }
    var routineNextActivityName by remember { mutableStateOf("স্কুল সমাবেশ (School Assembly)") }
    var routineTimeSlot by remember { mutableStateOf("০৮:৪৫ – ০৯:৩০") }
    var selectedIntensity by remember { mutableStateOf("MODERATE") }
    var routineDurationMinutes by remember { mutableStateOf("45") }
    var routineTargetClass by remember { mutableStateOf("৬ষ্ঠ–১০ম শ্রেণি") }
    var metricDetailType by remember { mutableStateOf<String?>(null) }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Action Error Banner
            if (actionError != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = actionError ?: "",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { viewModel.clearActionError() }) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Dismiss",
                                tint = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }
                }
            }

            // Minimal Clean Header: School Name, User Info, Language, Logout
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 8.dp)
                ) {
                    Text(
                        text = if (isBengali)
                            (userSession?.schoolNameBn ?: "ঢাকা মডেল স্কুল")
                        else
                            (userSession?.schoolNameEn ?: "Dhaka Model School"),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = SafeGreen,
                        maxLines = 2,
                        lineHeight = 22.sp
                    )
                    Text(
                        text = if (userSession != null) {
                            val roleStr = if (userSession?.role == UserRole.COORDINATOR)
                                (if (isBengali) "কোঅর্ডিনেটর" else "Coordinator")
                            else
                                (if (isBengali) "শিক্ষক" else "Teacher")
                            val cleanName = if (isBengali) {
                                userSession!!.nameBn
                            } else {
                                userSession!!.nameEn
                                    .replace("Assistant Teacher ", "")
                                    .replace("Principal ", "")
                                    .replace("Teacher ", "")
                            }
                            "$cleanName • $roleStr"
                        } else {
                            if (isBengali) "এয়ারসেফ পোর্টাল" else "AirSafe Portal"
                        },
                        fontSize = 13.sp,
                        color = TextSecondary,
                        maxLines = 2,
                        lineHeight = 18.sp
                    )
                }

                // Accessible Touch Targets (min 48.dp)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Language Toggle
                    Surface(
                        onClick = { viewModel.toggleLanguage() },
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier
                            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                            .wrapContentSize(Alignment.Center)
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = if (isBengali) "English" else "বাংলা",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = SafeGreen
                            )
                        }
                    }

                    // Logout Button
                    IconButton(
                        onClick = { viewModel.logout() },
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Logout,
                            contentDescription = if (isBengali) "লগআউট" else "Logout",
                            tint = DangerRed,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Offline Banner Indicator (U-3 & U-8)
            if (isOffline) {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 10.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.CloudOff, contentDescription = null, tint = CautionText)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isBengali)
                                "ইন্টারনেট অফলাইন: ক্যাশ থেকে শেষ পাওয়া তথ্য দেখানো হচ্ছে।"
                            else
                                "Offline: Displaying latest cached snapshot.",
                            color = CautionText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Active Coordinator Override Banner (F-11 & J-3)
            if (activeOverride != null) {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DangerRedBackground),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isBengali)
                                "কোঅর্ডিনেটর ওভাররাইড কার্যকর: $activeOverride"
                            else
                                "Coordinator Override Active: $activeOverride",
                            color = DangerRed,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            when (val state = uiState) {
                is DecisionUiState.Loading -> {
                    // U-3: Skeleton Screen during Loading State
                    DecisionCardSkeleton(isBengali = isBengali)
                }
                is DecisionUiState.Success -> {
                    // Stale Warning (>90m) with dynamic minute calculation (U-3 & F-07)
                    if (isOffline || state.data.isStale == true) {
                        val staleMins = state.data.dataAgeMinutes ?: (if (isOffline) 15 else 95)
                        val staleMinsStr = staleMins.toString().toBengaliDigits(isBengali)
                        Card(
                            colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Schedule,
                                    contentDescription = null,
                                    tint = CautionText,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (isBengali)
                                        "সতর্কতা: ডেটা $staleMinsStr মিনিট পুরোনো (পলিসি অনুযায়ী সতর্কতামূলক ক্যাপ প্রযোজ্য)।"
                                    else
                                        "Warning: Data is $staleMins mins old (Safety caps applied).",
                                    color = CautionText,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    // U-1 Action-First Decision Card with clickable metric details
                    DecisionCardContent(
                        data = state.data,
                        isBengali = isBengali,
                        isOffline = isOffline,
                        onRefresh = {
                            val schoolId = state.data.schoolId ?: userSession?.schoolId ?: "school-dhaka-001"
                            viewModel.loadSchoolData(schoolId)
                        },
                        onMetricClick = { mType ->
                            metricDetailType = mType
                        }
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // ROLE-SPECIFIC ACTIONS (U-9 & F-08 & F-11)
                    if (userSession?.role == UserRole.TEACHER) {
                        // F-08: Teacher Activity Context Note Button
                        OutlinedButton(
                            onClick = { showNoteDialog = true },
                            enabled = !isOffline,
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp)
                                .wrapContentHeight(),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.NoteAdd,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isOffline) {
                                    if (isBengali) "অ্যাক্টিভিটি প্রেক্ষাপট নোট (অফলাইনে নিষ্ক্রিয়)" else "Add Activity Note (Offline Disabled)"
                                } else {
                                    if (isBengali) "অ্যাক্টিভিটি প্রেক্ষাপট নোট (যেমন: আজমা)" else "Add Activity Note (e.g. Asthma)"
                                },
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                textAlign = TextAlign.Center
                            )
                        }

                        if (activityNotes.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            activityNotes.forEach { note ->
                                Text(
                                    text = "📝 $note",
                                    fontSize = 13.sp,
                                    color = TextSecondary,
                                    modifier = Modifier.align(Alignment.Start)
                                )
                            }
                        }
                    } else if (userSession?.role == UserRole.COORDINATOR) {
                        // F-11: Coordinator Override Button (J-3)
                        Button(
                            onClick = { showOverrideDialog = true },
                            enabled = !isOffline,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ModifyOrange,
                                disabledContainerColor = Color(0xFFE0E0E0),
                                disabledContentColor = Color(0xFF757575)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp)
                                .wrapContentHeight(),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.EditCalendar,
                                contentDescription = null,
                                tint = if (!isOffline) Color.White else Color(0xFF757575),
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isOffline) {
                                    if (isBengali) "সিদ্ধান্ত ওভাররাইড (অফলাইনে নিষ্ক্রিয়)" else "Override Decision (Offline Disabled)"
                                } else {
                                    stringResource(R.string.btn_coordinator_override)
                                },
                                color = if (!isOffline) Color.White else Color(0xFF757575),
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // F-10: Routine & Activity Management Button
                        OutlinedButton(
                            onClick = { showRoutineDialog = true },
                            enabled = !isOffline,
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp)
                                .wrapContentHeight(),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.DateRange,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isOffline) {
                                    if (isBengali) "রুটিন কনফিগার (অফলাইনে নিষ্ক্রিয়)" else "Manage Routine (Offline Disabled)"
                                } else {
                                    if (isBengali) "রুটিন ও অ্যাক্টিভিটি কনফিগার করুন" else "Manage Routine & Activities"
                                },
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Deterioration Alert Test & Reset (F-06 / J-3)
                    OutlinedButton(
                        onClick = { viewModel.triggerSimulationDeterioration() },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .wrapContentHeight(),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = DangerRed,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isBengali) "🚨 সতর্কতা টেস্ট: অবস্থা খারাপ হলে নোটিফিকেশন" else "🚨 Test Alert: Notify on Deterioration",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center
                        )
                    }

                    if (state.data.status == "RED") {
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = {
                                val sId = userSession?.schoolId ?: viewModel.selectedSchoolId.value
                                viewModel.loadCurrentDecision(sId)
                            },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = SafeGreen),
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp)
                                .wrapContentHeight(),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = null,
                                tint = SafeGreen,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "🔄 " + stringResource(R.string.decision_cloud_reset),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // F-15: Authoritative Policy Attribution & Rule Viewer Link
                    Card(
                        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
                        shape = RoundedCornerShape(12.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Gavel,
                                    contentDescription = null,
                                    tint = SafeGreen,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = stringResource(R.string.active_policy_tag),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextPrimary
                                    )
                                    Text(
                                        text = if (isBengali) "সিদ্ধান্ত লিংক: ${state.data.decision} • ১ অক্টোবর ২০২৬" else "Governed: ${state.data.decision} • Oct 1, 2026",
                                        fontSize = 11.sp,
                                        color = TextSecondary
                                    )
                                }
                            }
                            TextButton(
                                onClick = { showPolicyDialog = true },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.view_policy_rules),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SafeGreen
                                )
                            }
                        }
                    }

                    // F-03: School Sensor Sites (Field, Courtyard, Classroom)
                    SensorSitesView(viewModel = viewModel)
                }
                is DecisionUiState.Error -> {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = DangerRedBackground),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = DangerRed,
                                modifier = Modifier.size(44.dp)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = if (isBengali) "সার্ভার সংযোগে ত্রুটি" else "Server Connection Error",
                                color = DangerRed,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = state.message,
                                color = TextPrimary,
                                fontSize = 12.sp,
                                lineHeight = 17.sp,
                                textAlign = TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(16.dp))

                            // Retry Button
                            Button(
                                onClick = {
                                    val schoolId = userSession?.schoolId ?: "school-dhaka-001"
                                    viewModel.loadCurrentDecision(schoolId)
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = DangerRed),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 48.dp),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(stringResource(R.string.btn_refresh), color = Color.White)
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            // Use Offline Fallback
                            OutlinedButton(
                                onClick = {
                                    val schoolId = userSession?.schoolId ?: "school-dhaka-001"
                                    viewModel.useOfflineFallback(schoolId)
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 48.dp),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(
                                    if (isBengali) "অফলাইন ক্যাশ ও লোকাল পলিসি ব্যবহার করুন" else "Use Offline Mode & Local Policy",
                                    color = SafeGreen,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Modular Dialogs (F-06, F-15, F-08, F-11, F-10, U-1)
    if (showExplanationDialog) {
        val safeData = (uiState as? DecisionUiState.Success)?.data?.sanitized()
        ExplanationDialog(safeData, isBengali) { viewModel.dismissExplanationDialog() }
    }

    if (showPolicyDialog) {
        val safeData = (uiState as? DecisionUiState.Success)?.data?.sanitized()
        PolicyDialog(safeData?.decision ?: "UNKNOWN", isBengali) { showPolicyDialog = false }
    }

    if (showNoteDialog) {
        val safeData = (uiState as? DecisionUiState.Success)?.data?.sanitized()
        val currentActName = if (isBengali)
            (safeData?.currentActivityBn ?: "সকালের বহিরাঙ্গন ক্লাস")
        else
            (safeData?.currentActivityEn ?: "Morning Outdoor Session")

        ActivityNoteDialog(
            currentActName = currentActName,
            isBengali = isBengali,
            onSaveNote = { note ->
                viewModel.addActivityNote(note = note, activityId = "current", activityName = currentActName)
            },
            onDismiss = { showNoteDialog = false }
        )
    }

    if (showOverrideDialog) {
        val currentDec = (uiState as? DecisionUiState.Success)?.data?.decision ?: "UNKNOWN"
        OverrideDialog(
            currentDec = currentDec,
            isBengali = isBengali,
            onApplyOverride = { decisionText, reason ->
                viewModel.applyCoordinatorOverride(decisionText, reason)
            },
            onDismiss = { showOverrideDialog = false }
        )
    }

    if (showRoutineDialog) {
        RoutineUpdateDialog(
            initialActivityName = routineActivityName,
            initialNextActivityName = routineNextActivityName,
            isBengali = isBengali,
            onSaveRoutine = { name, nextName, intensity, classGrade, duration ->
                viewModel.updateRoutineActivity(
                    activityNameBn = name,
                    activityNameEn = name,
                    intensity = intensity,
                    durationMinutes = duration,
                    targetClass = classGrade.ifBlank { null },
                    nextActivityNameBn = nextName.ifBlank { null },
                    nextActivityNameEn = nextName.ifBlank { null }
                )
            },
            onDismiss = { showRoutineDialog = false }
        )
    }

    metricDetailType?.let { mType ->
        val safeData = (uiState as? DecisionUiState.Success)?.data?.sanitized()
        MetricDetailDialog(mType, safeData, isBengali) { metricDetailType = null }
    }
}

@Composable
fun DecisionCardContent(
    data: DecisionResponse,
    isBengali: Boolean,
    onRefresh: () -> Unit,
    onMetricClick: (String) -> Unit = {},
    isOffline: Boolean = false
) {
    val safeData = data.sanitized()

    // D-1 & D-4: Strict Policy v1.2 Four-Tier Outcome Model (Fail-Closed)
    val outcome = resolveOutcome(safeData.decision, safeData.status)

    val style = when (outcome) {
        PolicyOutcome.MOVE_INDOORS -> DecisionCardStyle(
            DangerRed,
            DangerRedBackground,
            Icons.Filled.Cancel,
            if (isBengali) "ভেতরে নিন (MOVE INDOORS)" else "MOVE INDOORS"
        )
        PolicyOutcome.MODIFY -> DecisionCardStyle(
            ModifyOrange,
            ModifyOrangeBackground,
            Icons.Filled.Warning,
            if (isBengali) "কার্যক্রম সীমিত করুন (MODIFY)" else "MODIFY ACTIVITIES"
        )
        PolicyOutcome.PROCEED_WITH_PRECAUTIONS -> DecisionCardStyle(
            CautionYellow,
            CautionYellowBackground,
            Icons.Filled.Info,
            if (isBengali) "সতর্কতা সহ চালান (CAUTION)" else "PROCEED WITH PRECAUTIONS"
        )
        PolicyOutcome.PROCEED -> DecisionCardStyle(
            SafeGreen,
            SafeGreenBackground,
            Icons.Filled.CheckCircle,
            if (isBengali) "বাইরে যাওয়া নিরাপদ (SAFE)" else "PROCEED (SAFE)"
        )
        PolicyOutcome.UNKNOWN -> DecisionCardStyle(
            UnknownGray,
            UnknownGrayBackground,
            Icons.AutoMirrored.Filled.HelpOutline,
            if (isBengali) "তথ্য পাওয়া যায়নি (DATA UNAVAILABLE)" else "DATA UNAVAILABLE"
        )
    }
    val statusColor = style.statusColor
    val statusBgColor = style.statusBgColor
    val icon = style.icon
    val statusText = style.statusText

    // D-14: Language-sensitive TalkBack contentDescription
    val a11yDescription = if (isBengali) {
        "সিদ্ধান্ত: $statusText। কারণ: ${safeData.primaryReason ?: "অজানা"}। হিট ইনডেক্স: ${safeData.heatIndexC?.toString() ?: "অনুপস্থিত"} সেলসিয়াস। AQI: ${safeData.aqi?.toString() ?: "অনুপস্থিত"}।"
    } else {
        "Decision: $statusText. Reason: ${safeData.primaryReason ?: "Unknown"}. Heat Index: ${safeData.heatIndexC?.toString() ?: "Unavailable"} C. AQI: ${safeData.aqi?.toString() ?: "Unavailable"}."
    }

    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = statusBgColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = a11yDescription }
    ) {
        Column(
            modifier = Modifier
                .padding(20.dp)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            val rawName = safeData.schoolName ?: "Dhaka Model School"
            val displaySchoolName = if (isBengali) {
                if (rawName.contains("(")) rawName.substringBefore(" (").trim() else rawName
            } else {
                if (rawName.contains("(")) rawName.substringAfter("(").removeSuffix(")").trim().ifBlank { "Dhaka Model School" } else "Dhaka Model School"
            }

            Text(
                text = displaySchoolName,
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentWidth(Alignment.CenterHorizontally),
                textAlign = TextAlign.Center,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
                color = TextSecondary
            )

            Spacer(modifier = Modifier.height(8.dp))

            // F-02: Current Routine Banner
            val currentActText = (if (isBengali) safeData.currentActivityBn else safeData.currentActivityEn)
                ?: (if (isBengali) "তথ্য নেই" else "No routine scheduled")

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = Color.White.copy(alpha = 0.88f)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.current_activity) + ": ",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = currentActText,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // F-02 MUST: Dedicated "Next Activity" Card (পরের অ্যাক্টিভিটি কার্ড)
            val nextActItem = safeData.nextActivity ?: safeData.activities?.find { it.isCurrent == false && it.order == 2 }
            val nextActName = (if (isBengali) nextActItem?.nameBn ?: safeData.nextActivityBn else nextActItem?.nameEn ?: safeData.nextActivityEn)
                ?: (if (isBengali) "স্কুল সমাবেশ (School Assembly)" else "School Assembly")
            val nextActTime = nextActItem?.timeSlot ?: (if (isBengali) "০৯:৫০ – ১০:৩৫" else "09:50 – 10:35")
            val nextActIntensity = nextActItem?.intensity ?: "LIGHT"
            val nextActDecision = nextActItem?.decision ?: (if (safeData.status == "RED") "MOVE_INDOORS" else "PROCEED")
            val nextActStatus = nextActItem?.status ?: (if (safeData.status == "RED") "RED" else "GREEN")
            val nextActReason = nextActItem?.primaryReason ?: (if (isBengali) "স্বাভাবিক আবহাওয়া ও সহনশীল শারীরিক কসরত" else "Normal conditions & light physical activity")

            val nextActColor = when (nextActStatus) {
                "RED" -> DangerRed
                "ORANGE" -> ModifyOrange
                "YELLOW" -> CautionYellow
                "GREEN" -> SafeGreen
                else -> Color(0xFF757575)
            }
            val nextActDecisionText = when (nextActDecision) {
                "MOVE_INDOORS" -> if (isBengali) "ভেতরে নিন (MOVE INDOORS)" else "MOVE INDOORS"
                "MODIFY" -> if (isBengali) "কার্যক্রম সীমিত (MODIFY)" else "MODIFY ACTIVITIES"
                "PROCEED_WITH_PRECAUTIONS" -> if (isBengali) "সতর্কতা (PROCEED W/ PRECAUTIONS)" else "PROCEED W/ PRECAUTIONS"
                "PROCEED" -> if (isBengali) "চালিয়ে যান (PROCEED)" else "PROCEED"
                else -> if (isBengali) "অজানা (UNKNOWN)" else "UNKNOWN"
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = Color.White.copy(alpha = 0.95f),
                shadowElevation = 2.dp,
                border = BorderStroke(1.dp, nextActColor.copy(alpha = 0.5f))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.FastForward,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = nextActColor
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (isBengali) "পরের অ্যাক্টিভিটি (Next Activity)" else "Next Activity",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = nextActColor
                        ) {
                            Text(
                                text = nextActDecisionText,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = nextActName,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                        Text(
                            text = nextActTime,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextSecondary
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    val intensityTextBn = if (nextActIntensity == "VIGOROUS") "তীব্র (Vigorous)" else if (nextActIntensity == "LIGHT") "হালকা (Light)" else "মাঝারি (Moderate)"
                    Text(
                        text = if (isBengali) "তীব্রতা: $intensityTextBn • $nextActReason" else "Intensity: $nextActIntensity • $nextActReason",
                        fontSize = 11.sp,
                        color = TextSecondary,
                        lineHeight = 15.sp
                    )
                }
            }

            // F-10 / P4: Comprehensive Activity Schedule Table (Modular Component)
            if (!safeData.activities.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                RoutineScheduleSection(
                    activities = safeData.activities,
                    isBengali = isBengali
                )
            }
            Spacer(modifier = Modifier.height(10.dp))

            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = statusColor,
                modifier = Modifier.size(60.dp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = statusText,
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentWidth(Alignment.CenterHorizontally)
                    .padding(horizontal = 8.dp),
                textAlign = TextAlign.Center,
                fontSize = 20.sp,
                lineHeight = 26.sp,
                fontWeight = FontWeight.Bold,
                color = statusColor,
                softWrap = true
            )

            // D-4: If outcome is MODIFY, show mandatory time limit & shade requirement badges
            if (outcome == PolicyOutcome.MODIFY) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val durationLimit = safeData.maxDurationMinutes ?: 30
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = ModifyOrange.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = if (isBengali) "সর্বোচ্চ ${durationLimit.toString().toBengaliDigits(isBengali)} মিনিট" else "Max $durationLimit mins",
                            color = ModifyOrange,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }
                    if (safeData.requiresShade != false) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ModifyOrange.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = if (isBengali) "ছায়াযুক্ত স্থান আবশ্যক" else "Shade Required",
                                color = ModifyOrange,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Primary Reason Box
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentHeight()
                    .background(Color.White, RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = if (isBengali) "প্রধান কারণ:" else "Primary Reason:",
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentWidth(Alignment.CenterHorizontally),
                        textAlign = TextAlign.Center,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    val reason = if (!isBengali && !safeData.primaryReasonEn.isNullOrBlank()) {
                        safeData.primaryReasonEn
                    } else if (!isBengali) {
                        when (outcome) {
                            PolicyOutcome.MOVE_INDOORS -> "🚨 Extreme Hazard: US AQI ${safeData.aqi ?: "—"} or Heat Index ${safeData.heatIndexC ?: "—"}°C exceeds safety floor. All outdoor activities must move indoors."
                            PolicyOutcome.MODIFY -> "Live Open-Meteo Observation: US AQI is ${safeData.aqi ?: "—"} and Heat Index is ${safeData.heatIndexC ?: "—"}°C. Per Policy v1.2, MODIFY activities — max ${safeData.maxDurationMinutes ?: 15} mins with mandatory shade."
                            PolicyOutcome.PROCEED_WITH_PRECAUTIONS -> "Live Open-Meteo Observation: Heat Index ${safeData.heatIndexC ?: "—"}°C and AQI ${safeData.aqi ?: "—"} within tolerable limits — stay hydrated and use shade."
                            PolicyOutcome.PROCEED -> "Conditions are within normal safety limits. Safe to proceed with outdoor classes."
                            PolicyOutcome.UNKNOWN -> "No reliable telemetry available. Stay indoors for safety."
                        }
                    } else {
                        safeData.primaryReason ?: "পরিবেশ পরিস্থিতি নীতিমালার নিরাপদ সীমায় রয়েছে।"
                    }

                    Text(
                        text = reason,
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentWidth(Alignment.CenterHorizontally),
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        color = TextPrimary,
                        softWrap = true
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // D-2 & U-1: Real values with equal column distribution (Tappable for breakdown)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onMetricClick("HEAT_INDEX") },
                    contentAlignment = Alignment.Center
                ) {
                    MetricItem(
                        label = if (isBengali) "হিট ইনডেক্স ℹ️" else "Heat Index ℹ️",
                        value = if (safeData.heatIndexC != null) "${safeData.heatIndexC.toString().toBengaliDigits(isBengali)}°C" else "—"
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onMetricClick("AQI") },
                    contentAlignment = Alignment.Center
                ) {
                    MetricItem(
                        label = "US AQI ℹ️",
                        value = safeData.aqi?.toString()?.toBengaliDigits(isBengali) ?: "—"
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onMetricClick("SOURCE") },
                    contentAlignment = Alignment.Center
                ) {
                    MetricItem(
                        label = if (isBengali) "উৎস ℹ️" else "Source ℹ️",
                        value = when (safeData.isModeled) {
                            true -> if (isBengali) "মডেল করা" else "Modeled"
                            false -> if (isBengali) "মাপা" else "Measured"
                            null -> if (isBengali) "অজানা" else "Unknown"
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // F-02 MUST: Confidence Level (আস্থার মাত্রা), When It Might Change (কখন বদলাতে পারে), and Data Freshness (ডেটার বয়স)
            val confidenceVal = safeData.confidenceLevelPct ?: (if (safeData.isModeled == true) 75 else 95)
            val confLabelText = if (isBengali)
                safeData.confidenceLabelBn ?: (if (safeData.isModeled == true) "মডেল করা স্যাটেলাইট ডেটা" else "পরিমাপিত ক্যাম্পাস IoT সেন্সর")
            else
                safeData.confidenceLabelEn ?: (if (safeData.isModeled == true) "Modeled Satellite Telemetry" else "Measured Campus IoT Sensor")

            val changeForecastText = if (isBengali)
                safeData.changeForecastBn ?: "পরবর্তী ৪ ঘণ্টায় পরিবর্তনের সম্ভাবনা নেই (স্থিতিশীল)"
            else
                safeData.changeForecastEn ?: "No decision change expected in the next 4 hours (Stable)"

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = Color.White.copy(alpha = 0.95f),
                shadowElevation = 1.dp
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                ) {
                    // 1. Confidence Level (আস্থার মাত্রা)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = SafeGreen
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isBengali)
                                "আস্থার মাত্রা: ${confidenceVal.toString().toBengaliDigits(isBengali)}% ($confLabelText)"
                            else
                                "Confidence Level: ${confidenceVal}% ($confLabelText)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // 2. When it might change (কখন বদলাতে পারে)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Timer,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = ModifyOrange
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isBengali)
                                "কখন বদলাতে পারে: $changeForecastText"
                            else
                                "When it might change: $changeForecastText",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // 3. Data Freshness (ডেটার বয়স)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Schedule,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = SafeGreen
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        val freshnessStr = com.airsafe.schools.data.model.formatRelativeTimeAgo(safeData.lastUpdated, isBengali)
                        Text(
                            text = if (isBengali) "ডেটার বয়স (তথ্যের সময়): $freshnessStr" else "Data Freshness: $freshnessStr",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextSecondary
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = onRefresh,
                enabled = !isOffline,
                colors = ButtonDefaults.buttonColors(
                    containerColor = statusColor,
                    disabledContainerColor = Color(0xFFE0E0E0),
                    disabledContentColor = Color(0xFF757575)
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = null,
                    tint = if (!isOffline) Color.White else Color(0xFF757575),
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isOffline) {
                        if (isBengali) "অফলাইন (রিফ্রেশ নিষ্ক্রিয়)" else "Offline (Refresh Disabled)"
                    } else {
                        if (isBengali) "রিফ্রেশ করুন" else "Refresh Live Decision"
                    },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (!isOffline) Color.White else Color(0xFF757575)
                )
            }
        }
    }
}

