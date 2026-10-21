package com.airsafe.schools.ui.screens

import androidx.compose.foundation.background
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
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.data.model.DecisionUiState
import com.airsafe.schools.data.model.UserRole
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

/**
 * Policy v1.2 Four-Tier Outcome Model + Fail-Closed UNKNOWN state (Hard Gate 4)
 */
enum class PolicyOutcome {
    PROCEED,
    PROCEED_WITH_PRECAUTIONS,
    MODIFY,
    MOVE_INDOORS,
    UNKNOWN
}

fun resolveOutcome(decision: String?, status: String?): PolicyOutcome {
    val normDecision = decision?.uppercase()?.trim()
    val normStatus = status?.uppercase()?.trim()

    return when {
        normDecision == "MOVE_INDOORS" || normStatus == "RED" -> PolicyOutcome.MOVE_INDOORS
        normDecision == "MODIFY" || normStatus == "ORANGE" -> PolicyOutcome.MODIFY
        normDecision == "PROCEED_WITH_PRECAUTIONS" || normStatus == "YELLOW" -> PolicyOutcome.PROCEED_WITH_PRECAUTIONS
        normDecision == "PROCEED" || normStatus == "GREEN" -> PolicyOutcome.PROCEED
        else -> PolicyOutcome.UNKNOWN
    }
}

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
    val scrollState = rememberScrollState()

    var showNoteDialog by remember { mutableStateOf(false) }
    var noteInput by remember { mutableStateOf("") }

    var showOverrideDialog by remember { mutableStateOf(false) }
    var overrideReason by remember { mutableStateOf("") }
    var selectedOverrideDecision by remember { mutableStateOf("MOVE_INDOORS") }
    var overrideValidationError by remember { mutableStateOf<String?>(null) }

    var showRoutineDialog by remember { mutableStateOf(false) }
    var routineActivityName by remember { mutableStateOf("পিই ও খেলাধুলা (PE & Games)") }
    var selectedIntensity by remember { mutableStateOf("MODERATE") }
    var routineDurationMinutes by remember { mutableStateOf("45") }
    var routineTargetClass by remember { mutableStateOf("৬ষ্ঠ–১০ম শ্রেণি") }

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
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
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
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
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
                        Icon(Icons.Default.CloudOff, contentDescription = null, tint = CautionYellow)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isBengali)
                                "ইন্টারনেট অফলাইন: ক্যাশ থেকে শেষ পাওয়া তথ্য দেখানো হচ্ছে।"
                            else
                                "Offline: Displaying latest cached snapshot.",
                            color = CautionYellow,
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
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = SafeGreen)
                    }
                }
                is DecisionUiState.Success -> {
                    // Stale Warning (>90m)
                    if (state.data.isStale == true) {
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
                                    tint = CautionYellow,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (isBengali)
                                        "সতর্কতা: ডেটা ৯০ মিনিটের বেশি পুরোনো।"
                                    else
                                        "Warning: Data older than 90m.",
                                    color = CautionYellow,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    // U-1 Action-First Decision Card
                    DecisionCardContent(
                        data = state.data,
                        isBengali = isBengali,
                        onRefresh = {
                            val schoolId = state.data.schoolId ?: userSession?.schoolId ?: "school-dhaka-001"
                            viewModel.loadCurrentDecision(schoolId)
                        }
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // ROLE-SPECIFIC ACTIONS (U-9 & F-08 & F-11)
                    if (userSession?.role == UserRole.TEACHER) {
                        // F-08: Teacher Activity Context Note Button
                        OutlinedButton(
                            onClick = { showNoteDialog = true },
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
                                text = if (isBengali) "অ্যাক্টিভিটি প্রেক্ষাপট নোট (যেমন: আজমা)" else "Add Activity Note (e.g. Asthma)",
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
                            colors = ButtonDefaults.buttonColors(containerColor = CautionYellow),
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
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isBengali) "সিদ্ধান্ত ওভাররাইড করুন" else "Override Decision",
                                color = Color.White,
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
                                text = if (isBengali) "রুটিন ও অ্যাক্টিভিটি কনফিগার করুন" else "Manage Routine & Activities",
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

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
                                Text(if (isBengali) "পুনরায় চেষ্টা করুন" else "Retry Connection", color = Color.White)
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

    // Teacher Note Dialog (F-08)
    if (showNoteDialog) {
        AlertDialog(
            onDismissRequest = { showNoteDialog = false },
            title = { Text(if (isBengali) "অ্যাক্টিভিটি প্রেক্ষাপট নোট" else "Add Activity Context") },
            text = {
                OutlinedTextField(
                    value = noteInput,
                    onValueChange = { noteInput = it },
                    label = { Text(if (isBengali) "নোটের বিবরণ" else "Note Description") },
                    placeholder = { Text(if (isBengali) "যেমন: দুজন শিক্ষার্থীর আজমা/হাঁপানি আছে" else "e.g. 2 students have asthma") },
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (noteInput.isNotBlank()) {
                        viewModel.addActivityNote(noteInput)
                        noteInput = ""
                        showNoteDialog = false
                    }
                }) {
                    Text(if (isBengali) "সংরক্ষণ" else "Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showNoteDialog = false }) {
                    Text(if (isBengali) "বাতিল" else "Cancel")
                }
            }
        )
    }

    // Coordinator Override Dialog (F-11 & J-3: outcome choices + minimum 5 chars reason)
    if (showOverrideDialog) {
        AlertDialog(
            onDismissRequest = {
                showOverrideDialog = false
                overrideValidationError = null
            },
            title = { Text(if (isBengali) "বাধ্যতামূলক কারণসহ ওভাররাইড" else "Override with Justification") },
            text = {
                Column {
                    Text(
                        text = if (isBengali)
                            "নীতি অপরিবর্তিত থাকবে, শুধুমাত্র এই সেশনের সিদ্ধান্ত পরিবর্তিত হবে এবং অডিট লগে সংরক্ষিত হবে।"
                        else
                            "This override is temporary for this session and recorded in audit logs.",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = if (isBengali) "টার্গেট সিদ্ধান্ত:" else "Target Decision:",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        listOf("MOVE_INDOORS", "MODIFY", "PRECAUTIONS").forEach { opt ->
                            FilterChip(
                                selected = selectedOverrideDecision.contains(opt),
                                onClick = { selectedOverrideDecision = opt },
                                label = { Text(opt, fontSize = 11.sp) }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedTextField(
                        value = overrideReason,
                        onValueChange = {
                            overrideReason = it
                            if (it.trim().length >= 5) overrideValidationError = null
                        },
                        label = { Text(if (isBengali) "ওভাররাইডের কারণ" else "Override Reason") },
                        placeholder = { Text(if (isBengali) "কমপক্ষে ৫ অক্ষরের লিখিত কারণ..." else "Minimum 5 characters reason...") },
                        isError = overrideValidationError != null,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (overrideValidationError != null) {
                        Text(
                            text = overrideValidationError!!,
                            color = DangerRed,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (overrideReason.trim().length < 5) {
                            overrideValidationError = if (isBengali) "কারণ কমপক্ষে ৫ অক্ষরের হতে হবে" else "Reason must be at least 5 characters"
                        } else {
                            val decisionText = when (selectedOverrideDecision) {
                                "MODIFY" -> if (isBengali) "কার্যক্রম সীমিত (MODIFY)" else "MODIFY"
                                "PRECAUTIONS" -> if (isBengali) "সতর্কতা সহ (CAUTION)" else "PROCEED WITH PRECAUTIONS"
                                else -> if (isBengali) "ভেতরে নিন (MOVE INDOORS)" else "MOVE INDOORS"
                            }
                            viewModel.applyCoordinatorOverride(decisionText, overrideReason)
                            overrideReason = ""
                            overrideValidationError = null
                            showOverrideDialog = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                ) {
                    Text(if (isBengali) "ওভাররাইড প্রয়োগ" else "Apply Override", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showOverrideDialog = false
                    overrideValidationError = null
                }) {
                    Text(if (isBengali) "বাতিল" else "Cancel")
                }
            }
        )
    }

    // Coordinator Routine & Activity Management Dialog (F-10)
    if (showRoutineDialog) {
        AlertDialog(
            onDismissRequest = { showRoutineDialog = false },
            title = { Text(if (isBengali) "রুটিন ও অ্যাক্টিভিটি কনফিগারেশন" else "Configure Routine & Activities") },
            text = {
                Column {
                    Text(
                        text = if (isBengali)
                            "বর্তমান সেশনের জন্য অ্যাক্টিভিটি, শারীরিক তীব্রতা এবং শ্রেণি নির্ধারণ করুন:"
                        else
                            "Configure current session activity, physical intensity, and class:",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = if (isBengali) "অ্যাক্টিভিটির ধরন:" else "Activity Type:",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    OutlinedTextField(
                        value = routineActivityName,
                        onValueChange = { routineActivityName = it },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (isBengali) "শারীরিক তীব্রতা:" else "Physical Intensity:",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf("LIGHT", "MODERATE", "VIGOROUS").forEach { intensity ->
                            FilterChip(
                                selected = selectedIntensity == intensity,
                                onClick = {
                                    selectedIntensity = intensity
                                },
                                label = { Text(intensity, fontSize = 11.sp) }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (isBengali) "শ্রেণি ও সময়কাল:" else "Target Class & Duration:",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = routineTargetClass,
                            onValueChange = { routineTargetClass = it },
                            modifier = Modifier.weight(1f),
                            label = { Text(if (isBengali) "শ্রেণি" else "Class") }
                        )
                        OutlinedTextField(
                            value = routineDurationMinutes,
                            onValueChange = { routineDurationMinutes = it },
                            modifier = Modifier.weight(1f),
                            label = { Text(if (isBengali) "সময়কাল (মিনিট)" else "Duration (mins)") }
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val duration = routineDurationMinutes.toIntOrNull() ?: 45
                        viewModel.updateRoutineActivity(
                            activityNameBn = routineActivityName,
                            activityNameEn = routineActivityName,
                            intensity = selectedIntensity,
                            durationMinutes = duration,
                            targetClass = routineTargetClass.ifBlank { null }
                        )
                        showRoutineDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
                ) {
                    Text(if (isBengali) "সংরক্ষণ করুন" else "Save Routine", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRoutineDialog = false }) {
                    Text(if (isBengali) "বাতিল" else "Cancel")
                }
            }
        )
    }
}

data class DecisionCardStyle(
    val statusColor: Color,
    val statusBgColor: Color,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val statusText: String
)

@Composable
fun DecisionCardContent(
    data: DecisionResponse,
    isBengali: Boolean,
    onRefresh: () -> Unit
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

            // F-02: Routine banner
            val currentActText = (if (isBengali) safeData.currentActivityBn else safeData.currentActivityEn)
                ?: (if (isBengali) "তথ্য নেই" else "No routine scheduled")
            val nextActText = if (isBengali) safeData.nextActivityBn else safeData.nextActivityEn
            val hasNextActivity = !nextActText.isNullOrBlank()

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = Color.White.copy(alpha = 0.88f)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f, fill = false),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isBengali) "বর্তমান: " else "Now: ",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Text(
                            text = currentActText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                    }
                    if (hasNextActivity) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Row(
                            modifier = Modifier.weight(1f, fill = false),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.End
                        ) {
                            Text(
                                text = if (isBengali) "পরবর্তী: " else "Next: ",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Text(
                                text = nextActText ?: "",
                                fontSize = 11.sp,
                                color = TextSecondary,
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                            )
                        }
                    }
                }
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
                            text = if (isBengali) "সর্বোচ্চ $durationLimit মিনিট" else "Max $durationLimit mins",
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

            // D-2: Real values with equal column distribution
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    MetricItem(
                        label = if (isBengali) "হিট ইনডেক্স" else "Heat Index",
                        value = if (safeData.heatIndexC != null) "${safeData.heatIndexC}°C" else "—"
                    )
                }
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    MetricItem(
                        label = "US AQI",
                        value = safeData.aqi?.toString() ?: "—"
                    )
                }
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    MetricItem(
                        label = if (isBengali) "উৎস" else "Source",
                        value = when (safeData.isModeled) {
                            true -> if (isBengali) "মডেল করা" else "Modeled"
                            false -> if (isBengali) "মাপা" else "Measured"
                            null -> if (isBengali) "অজানা" else "Unknown"
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Confidence Level & Weather Trend Row
            val confidenceVal = safeData.confidenceLevelPct
            val trendText = (if (isBengali) safeData.weatherTrendBn else safeData.weatherTrendEn)
                ?: (if (isBengali) "বর্তমান পূর্বাভাস স্থিতিশীল" else "Forecast conditions stable")

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = Color.White.copy(alpha = 0.88f)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f, fill = false),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = SafeGreen
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (confidenceVal != null && confidenceVal > 0)
                                (if (isBengali) "আস্থা: ${confidenceVal}%" else "Confidence: ${confidenceVal}%")
                            else
                                (if (isBengali) "আস্থা: —" else "Confidence: —"),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary,
                            maxLines = 1
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(
                        modifier = Modifier.weight(1.2f, fill = false),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.End
                    ) {
                        Icon(
                            imageVector = Icons.Default.Timer,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = TextSecondary
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = trendText,
                            fontSize = 11.sp,
                            color = TextSecondary,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = onRefresh,
                colors = ButtonDefaults.buttonColors(containerColor = statusColor),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isBengali) "রিফ্রেশ করুন" else "Refresh Live Decision",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
    }
}

@Composable
fun MetricItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, fontSize = 12.sp, color = TextSecondary)
        Spacer(modifier = Modifier.height(2.dp))
        Text(text = value, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
    }
}
