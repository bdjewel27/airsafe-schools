package com.airsafe.schools.ui.screens

import com.airsafe.schools.ui.screens.components.*

import androidx.compose.ui.platform.testTag
import androidx.compose.animation.AnimatedVisibility
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

    // Language-exclusive status titles (No mixed English/Bangla in parentheses!)
    val style = when (outcome) {
        PolicyOutcome.MOVE_INDOORS -> DecisionCardStyle(
            DangerRed,
            DangerRedBackground,
            Icons.Filled.Cancel,
            if (isBengali) "ভেতরে নিন" else "MOVE INDOORS"
        )
        PolicyOutcome.MODIFY -> DecisionCardStyle(
            ModifyOrange,
            ModifyOrangeBackground,
            Icons.Filled.Warning,
            if (isBengali) "কার্যক্রম সীমিত করুন" else "MODIFY ACTIVITIES"
        )
        PolicyOutcome.PROCEED_WITH_PRECAUTIONS -> DecisionCardStyle(
            CautionYellow,
            CautionYellowBackground,
            Icons.Filled.Info,
            if (isBengali) "সতর্কতা সহ চালান" else "PROCEED WITH CAUTION"
        )
        PolicyOutcome.PROCEED -> DecisionCardStyle(
            SafeGreen,
            SafeGreenBackground,
            Icons.Filled.CheckCircle,
            if (isBengali) "বাইরে যাওয়া নিরাপদ" else "SAFE OUTDOORS"
        )
        PolicyOutcome.UNKNOWN -> DecisionCardStyle(
            UnknownGray,
            UnknownGrayBackground,
            Icons.AutoMirrored.Filled.HelpOutline,
            if (isBengali) "তথ্য নেই" else "DATA UNAVAILABLE"
        )
    }
    val statusColor = style.statusColor
    val statusBgColor = style.statusBgColor
    val icon = style.icon
    val statusText = style.statusText

    var isScheduleExpanded by remember { mutableStateOf(false) }

    // D-14: Language-sensitive TalkBack contentDescription
    val a11yDescription = if (isBengali) {
        "সিদ্ধান্ত: $statusText। কারণ: ${safeData.primaryReason ?: "তথ্য নেই"}। হিট ইনডেক্স: ${safeData.heatIndexC?.toString()?.toBengaliDigits(true) ?: "তথ্য নেই"} সেলসিয়াস। বায়ুমান সূচক: ${safeData.aqi?.toString()?.toBengaliDigits(true) ?: "তথ্য নেই"}।"
    } else {
        "Decision: $statusText. Reason: ${safeData.primaryReasonEn ?: safeData.primaryReason ?: "No data"}. Heat Index: ${safeData.heatIndexC?.toString() ?: "No data"} C. AQI: ${safeData.aqi?.toString() ?: "No data"}."
    }

    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = statusBgColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = false) { contentDescription = a11yDescription }
    ) {
        Column(
            modifier = Modifier
                .padding(20.dp)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 1. সবার উপরে: বড় icon আর মূল সিদ্ধান্ত (Big Icon & Primary Decision)
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = statusColor,
                modifier = Modifier.size(52.dp)
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = statusText,
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentWidth(Alignment.CenterHorizontally)
                    .testTag("primary_decision_text"),
                textAlign = TextAlign.Center,
                fontSize = 22.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.Bold,
                color = statusColor
            )

            // D-4: If outcome is MODIFY, show mandatory time limit & shade requirement badges
            if (outcome == PolicyOutcome.MODIFY) {
                Spacer(modifier = Modifier.height(6.dp))
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
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                    if (safeData.requiresShade != false) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ModifyOrange.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = if (isBengali) "ছায়াযুক্ত স্থান আবশ্যক" else "Shade Required",
                                color = ModifyOrange,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // 2. এক লাইনে প্রধান কারণ (One line primary reason)
            val primaryReasonText = if (!isBengali && !safeData.primaryReasonEn.isNullOrBlank()) {
                safeData.primaryReasonEn!!
            } else if (!safeData.primaryReason.isNullOrBlank()) {
                safeData.primaryReason!!
            } else {
                if (isBengali) "পরিবেশ পরিস্থিতি নীতিমালার নিরাপদ সীমায় রয়েছে" else "Conditions within safety policy limits"
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = Color.White.copy(alpha = 0.9f)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = primaryReasonText,
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = TextPrimary,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // 3. কতক্ষণ আগের data, এবং stale হলে স্পষ্ট সতর্কবার্তা (Data freshness & stale warning)
            val isDataStale = safeData.isStale == true || isOffline
            val freshnessStr = com.airsafe.schools.data.model.formatRelativeTimeAgo(safeData.lastUpdated, isBengali)
            val freshnessText = if (isDataStale) {
                if (isBengali) "⚠️ ডেটা পুরোনো ($freshnessStr) — সতর্কতামূলক ক্যাপ কার্যকর" else "⚠️ Stale data ($freshnessStr) — Safety cap active"
            } else {
                if (isBengali) "আপডেট: $freshnessStr" else "Updated: $freshnessStr"
            }

            Text(
                text = freshnessText,
                textAlign = TextAlign.Center,
                fontSize = 12.sp,
                fontWeight = if (isDataStale) FontWeight.Bold else FontWeight.Normal,
                color = if (isDataStale) CautionText else TextSecondary,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(10.dp))

            // 4. দুইটি ছোট metric chip: Heat Index আর AQI (Two compact metric chips)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                val hiFormatted = if (safeData.heatIndexC != null) {
                    "${safeData.heatIndexC.toString().toBengaliDigits(isBengali)}°C"
                } else {
                    if (isBengali) "তথ্য নেই" else "No data"
                }

                val aqiFormatted = if (safeData.aqi != null) {
                    safeData.aqi.toString().toBengaliDigits(isBengali)
                } else {
                    if (isBengali) "তথ্য নেই" else "No data"
                }

                // Heat Index Chip
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color.White.copy(alpha = 0.95f),
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.2f)),
                    modifier = Modifier
                        .clickable { onMetricClick("HEAT_INDEX") }
                        .padding(end = 8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isBengali) "হিট ইনডেক্স: " else "Heat Index: ",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextSecondary
                        )
                        Text(
                            text = hiFormatted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }
                }

                // AQI Chip
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color.White.copy(alpha = 0.95f),
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.2f)),
                    modifier = Modifier
                        .clickable { onMetricClick("AQI") }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isBengali) "বায়ুমান সূচক: " else "AQI: ",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextSecondary
                        )
                        Text(
                            text = aqiFormatted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 5. "এখন: PE ও ফুটবল · পরে: Assembly"—এক লাইনে (Current & Next activity in one line)
            val currAct = if (isBengali) safeData.currentActivityBn else safeData.currentActivityEn
            val nextActItem = safeData.nextActivity ?: safeData.activities?.find { it.isCurrent == false && it.order == 2 }
            val nextAct = if (isBengali) (nextActItem?.nameBn ?: safeData.nextActivityBn) else (nextActItem?.nameEn ?: safeData.nextActivityEn)

            val noDataText = if (isBengali) "তথ্য নেই" else "No data"
            val activitiesLine = when {
                !currAct.isNullOrBlank() && !nextAct.isNullOrBlank() -> {
                    if (isBengali) "এখন: $currAct · পরে: $nextAct" else "Now: $currAct · Next: $nextAct"
                }
                !currAct.isNullOrBlank() -> {
                    if (isBengali) "এখন: $currAct" else "Now: $currAct"
                }
                !nextAct.isNullOrBlank() -> {
                    if (isBengali) "পরে: $nextAct" else "Next: $nextAct"
                }
                else -> {
                    if (isBengali) "কার্যক্রম: $noDataText" else "Activities: $noDataText"
                }
            }

            Text(
                text = activitiesLine,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = TextSecondary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp)
            )

            // 6. পুরো schedule একটি "সব দেখুন" অংশে, যা চাপলে খুলবে (collapsible)
            if (!safeData.activities.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    onClick = { isScheduleExpanded = !isScheduleExpanded },
                    shape = RoundedCornerShape(8.dp),
                    color = Color.White.copy(alpha = 0.85f),
                    border = BorderStroke(1.dp, Color.LightGray.copy(alpha = 0.5f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isBengali) {
                                if (isScheduleExpanded) "রুটিন সংক্ষেপ করুন ▲" else "সব দেখুন (রুটিন) ▼"
                            } else {
                                if (isScheduleExpanded) "Hide Schedule ▲" else "View All Schedule ▼"
                            },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = statusColor
                        )
                    }
                }

                AnimatedVisibility(visible = isScheduleExpanded) {
                    Column(modifier = Modifier.padding(top = 8.dp)) {
                        RoutineScheduleSection(
                            activities = safeData.activities,
                            isBengali = isBengali
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // 7. Refresh Button
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
                    .height(48.dp),
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
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (!isOffline) Color.White else Color(0xFF757575)
                )
            }
        }
    }
}
