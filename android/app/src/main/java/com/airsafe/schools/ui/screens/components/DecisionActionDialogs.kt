package com.airsafe.schools.ui.screens.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.R
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.theme.*

fun String.toBengaliDigits(isBengali: Boolean): String {
    if (!isBengali) return this
    val bnDigits = charArrayOf('০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯')
    val sb = StringBuilder()
    for (ch in this) {
        if (ch in '0'..'9') {
            sb.append(bnDigits[ch - '0'])
        } else {
            sb.append(ch)
        }
    }
    return sb.toString()
}

@Composable
fun ExplanationDialog(
    safeData: DecisionResponse?,
    isBengali: Boolean,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = if (isBengali) "🚨 জরুরি এয়ারসেফ ব্যাখ্যা ও সতর্কতা" else "🚨 Urgent AirSafe Alert Explanation",
                fontWeight = FontWeight.Bold,
                fontSize = 17.sp,
                color = DangerRed
            )
        },
        text = {
            Column {
                Text(
                    text = if (isBengali) "বর্তমান অবস্থা ও সিদ্ধান্ত:" else "Current Status and Decision:",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = safeData?.decision ?: "MOVE_INDOORS",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp,
                    color = DangerRed
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = if (isBengali) "প্রধান কারণ:" else "Primary Reason:",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = safeData?.primaryReason
                        ?: (if (isBengali) "হিট ইনডেক্স বা একিউআই সীমা অতিক্রম করায় জরুরি সতর্কতা জারি করা হয়েছে।" else "Safety threshold exceeded; urgent precaution required."),
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    color = TextSecondary
                )
                if (!safeData?.reasons.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (isBengali) "পলিসি রুলস ও কারণসমূহ:" else "Policy Rules and Reasons:",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp,
                        color = TextPrimary
                    )
                    safeData?.reasons?.forEach { r ->
                        Text(
                            text = "• $r",
                            fontSize = 12.sp,
                            color = TextSecondary,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = if (isBengali) "হিট ইনডেক্স: " + (safeData?.heatIndexC?.toString()?.toBengaliDigits(isBengali) ?: "—") + "°C" else "Heat Index: " + (safeData?.heatIndexC ?: "—") + "°C",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        text = if (isBengali) "US AQI: " + (safeData?.aqi?.toString()?.toBengaliDigits(isBengali) ?: "—") else "US AQI: " + (safeData?.aqi ?: "—"),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
            ) {
                Text(if (isBengali) "ঠিক আছে" else "Dismiss", color = Color.White)
            }
        }
    )
}

@Composable
fun PolicyDialog(
    activeDec: String,
    isBengali: Boolean,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Gavel, contentDescription = null, tint = SafeGreen, modifier = Modifier.size(22.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isBengali) "মডেল স্কুল আউটডোর পলিসি v1.2" else "Model School Outdoor Policy v1.2",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    text = if (isBengali) "কার্যকর তারিখ: ১ অক্টোবর ২০২৬ • কর্তৃপক্ষ: AirSafe Protocol" else "Effective: Oct 1, 2026 • Authority: AirSafe Protocol",
                    fontSize = 11.sp,
                    color = TextSecondary
                )
                Spacer(modifier = Modifier.height(10.dp))

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = SafeGreenBackground,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(
                            text = if (isBengali) "বর্তমান সক্রিয় সিদ্ধান্ত:" else "Current Active Decision:",
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                        Text(
                            text = "$activeDec (${if (isBengali) "এই নীতি দ্বারা মূল্যায়িত" else "Governed by Policy v1.2"})",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = SafeGreen
                        )
                    }
                }

                Text(
                    text = if (isBengali) "মূল নিরাপত্তা বিধি ও নিয়মাবলী (F-15):" else "Governing Safety Rules (F-15):",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(6.dp))

                val rules = listOf(
                    Pair("RULE-1: তাপ ও বায়ু থ্রেশহোল্ড", "Heat & AQI Thresholds (Table 1 & 2)"),
                    Pair("RULE-2: কার্যক্রমের তীব্রতা মডিফায়ার", "Activity Intensity Modifiers (Light, Moderate, Vigorous)"),
                    Pair("RULE-3: শ্বাসকষ্ট ও সংবেদনশীল শিক্ষার্থীর সতর্কতা", "Respiratory Vulnerability Step-Up (Asthma Protection)"),
                    Pair("RULE-4: ডেটা ফ্রেশনেস ও পুরোনো ডেটা ফ্লোর (৯০ মি.)", "Data Freshness Floor (Fail-closed on stale data)"),
                    Pair("RULE-5: সতর্কবার্তা ট্রিগার ও নীরব সময়", "Alert Triggers & Quiet Hours (21:00–06:00 BST)"),
                    Pair("RULE-6: কোঅর্ডিনেটর ওভাররাইড ও অডিট ট্রেইল", "Coordinator Override Governance (S4 / ADR-014)")
                )

                rules.forEach { r ->
                    Text(
                        text = "• " + (if (isBengali) r.first else r.second),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = TextPrimary,
                        modifier = Modifier.padding(vertical = 2.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "API Endpoint: /policies/current",
                    fontSize = 10.sp,
                    color = TextSecondary
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
            ) {
                Text(if (isBengali) "বুঝেছি" else "Dismiss", color = Color.White)
            }
        }
    )
}

@Composable
fun ActivityNoteDialog(
    currentActName: String,
    isBengali: Boolean,
    onSaveNote: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var noteInput by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isBengali) "অ্যাক্টিভিটি প্রেক্ষাপট নোট" else "Add Activity Context Note") },
        text = {
            Column {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                ) {
                    Text(
                        text = if (isBengali) "নির্দিষ্ট অ্যাক্টিভিটি: $currentActName" else "Target Activity: $currentActName",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SafeGreen,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                    )
                }
                OutlinedTextField(
                    value = noteInput,
                    onValueChange = { noteInput = it },
                    label = { Text(if (isBengali) "নোটের বিবরণ" else "Note Description") },
                    placeholder = { Text(if (isBengali) "যেমন: দুজন শিক্ষার্থীর আজমা/হাঁপানি আছে" else "e.g. 2 students have asthma") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                if (noteInput.isNotBlank()) {
                    onSaveNote(noteInput)
                    onDismiss()
                }
            }) {
                Text(if (isBengali) "সংরক্ষণ" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.btn_cancel))
            }
        }
    )
}

@Composable
fun OverrideDialog(
    currentDec: String,
    isBengali: Boolean,
    onApplyOverride: (decision: String, reason: String) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedOverrideDecision by remember { mutableStateOf("MOVE_INDOORS") }
    var overrideReason by remember { mutableStateOf("") }
    var overrideValidationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
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
                val allowedOptions = when (currentDec) {
                    "MOVE_INDOORS" -> listOf("MOVE_INDOORS")
                    "MODIFY" -> listOf("MOVE_INDOORS", "MODIFY")
                    else -> listOf("MOVE_INDOORS", "MODIFY", "PRECAUTIONS")
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    allowedOptions.forEach { opt ->
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
                            "MODIFY" -> "MODIFY"
                            "PRECAUTIONS" -> "PROCEED_WITH_PRECAUTIONS"
                            else -> "MOVE_INDOORS"
                        }
                        onApplyOverride(decisionText, overrideReason)
                        onDismiss()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
            ) {
                Text(stringResource(R.string.btn_override_apply), color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.btn_cancel))
            }
        }
    )
}

@Composable
fun RoutineUpdateDialog(
    initialActivityName: String,
    initialNextActivityName: String,
    isBengali: Boolean,
    onSaveRoutine: (name: String, nextName: String, intensity: String, classGrade: String, duration: Int) -> Unit,
    onDismiss: () -> Unit
) {
    var routineActivityName by remember { mutableStateOf(initialActivityName) }
    var routineNextActivityName by remember { mutableStateOf(initialNextActivityName) }
    var selectedIntensity by remember { mutableStateOf("MODERATE") }
    var routineTargetClass by remember { mutableStateOf("Class 5") }
    var routineDurationMinutes by remember { mutableStateOf("45") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.btn_manage_routine)) },
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
                    text = stringResource(R.string.current_activity) + ":",
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
                    text = if (isBengali) "পরবর্তী অ্যাক্টিভিটি:" else "Next Activity:",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                OutlinedTextField(
                    value = routineNextActivityName,
                    onValueChange = { routineNextActivityName = it },
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
                            onClick = { selectedIntensity = intensity },
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
                    onSaveRoutine(routineActivityName, routineNextActivityName, selectedIntensity, routineTargetClass, duration)
                    onDismiss()
                },
                colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
            ) {
                Text(if (isBengali) "সংরক্ষণ করুন" else "Save Routine", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.btn_cancel))
            }
        }
    )
}

@Composable
fun MetricDetailDialog(
    metricType: String,
    safeData: DecisionResponse?,
    isBengali: Boolean,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = when (metricType) {
                    "HEAT_INDEX" -> if (isBengali) "হিট ইনডেক্স ও পরিবেশগত তাপমাত্রা" else "Heat Index & Environmental Rules"
                    "AQI" -> if (isBengali) "বায়ুমান সূচক (US AQI ও PM2.5)" else "Air Quality Index (US AQI & PM2.5)"
                    else -> if (isBengali) "ডেটার উৎস ও নির্ভরযোগ্যতা" else "Data Source & Reliability"
                },
                fontWeight = FontWeight.Bold,
                fontSize = 17.sp,
                color = SafeGreen
            )
        },
        text = {
            Column {
                when (metricType) {
                    "HEAT_INDEX" -> {
                        val hiVal = safeData?.heatIndexC?.toString()?.toBengaliDigits(isBengali) ?: "—"
                        Text(
                            text = if (isBengali) "বর্তমান অনুভূত তাপমাত্রা: $hiVal°C" else "Current Observed Heat Index: $hiVal°C",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (isBengali)
                                "গণনা পদ্ধতি: শুষ্ক তাপমাত্রা ও আপেক্ষিক আর্দ্রতার সমন্বয়ে রথফুস (Rothfusz) সমীকরণ。\n\n" +
                                "Policy v1.2 সারণী ২-এর সীমা:\n" +
                                "• < ২৭°C: স্বাভাবিক (PROCEED)\n" +
                                "• ২৭°C–৩১°C: সতর্কতা ও প্রতি ২০ মিনিটে পানির বিরতি\n" +
                                "• ৩২°C–৩৮°C: MODIFY (ছায়া বাধ্যতামূলক, সর্বোচ্চ ৩০ মিনিট)\n" +
                                "• ≥ ৩৯°C: ভেতরে স্থানান্তর (MOVE INDOORS বাধ্যতামূলক)"
                            else
                                "Methodology: Rothfusz regression equation combining temperature and relative humidity.\n\n" +
                                "Policy v1.2 Table 2 Environmental Thresholds:\n" +
                                "• < 27°C: Safe to PROCEED\n" +
                                "• 27°C–31°C: Precautions with 20-min hydration breaks\n" +
                                "• 32°C–38°C: MODIFY (Mandatory shade, max 30 mins)\n" +
                                "• >= 39°C: Mandatory MOVE INDOORS",
                            fontSize = 12.sp,
                            lineHeight = 17.sp,
                            color = TextSecondary
                        )
                    }
                    "AQI" -> {
                        val aqiVal = safeData?.aqi?.toString()?.toBengaliDigits(isBengali) ?: "—"
                        val pmVal = safeData?.pm25Ugm3?.toString()?.toBengaliDigits(isBengali) ?: "—"
                        Text(
                            text = if (isBengali) "বর্তমান US AQI: $aqiVal (PM2.5: $pmVal µg/m³)" else "Current US AQI: $aqiVal (PM2.5: $pmVal µg/m³)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (isBengali)
                                "গণনা পদ্ধতি: EPA US AQI স্ট্যান্ডার্ড অনুযায়ী PM2.5 কণার ঘনত্বের ভিত্তিতে পরিমাপিত।\n\n" +
                                "Policy v1.2 সারণী ১-এর সীমা:\n" +
                                "• ০–৫০: ভালো (PROCEED)\n" +
                                "• ৫১–১০০: মাঝারি (তীব্র খেলায় বিশেষ সতর্কতা)\n" +
                                "• ১০১–১৫০: অস্বাস্থ্যকর সংবেদনশীলদের জন্য (MODIFY - সময় কমানো ও ছায়া)\n" +
                                "• ≥ ১৫১: বিপজ্জনক/খারাপ (MOVE INDOORS অবিলম্বে ভেতরে নেওয়া)"
                            else
                                "Methodology: EPA US AQI standard derived from PM2.5 particulate concentration.\n\n" +
                                "Policy v1.2 Table 1 Thresholds:\n" +
                                "• 0–50: Good (PROCEED)\n" +
                                "• 51–100: Moderate (Precautions for vigorous sports)\n" +
                                "• 101–150: Sensitive groups impacted (MODIFY - reduced duration)\n" +
                                "• >= 151: Critical / Unhealthy (Mandatory MOVE INDOORS)",
                            fontSize = 12.sp,
                            lineHeight = 17.sp,
                            color = TextSecondary
                        )
                    }
                    else -> {
                        val isModeled = safeData?.isModeled ?: true
                        val confidence = safeData?.confidenceLevelPct?.toString()?.toBengaliDigits(isBengali) ?: "৯৪"
                        Text(
                            text = if (isBengali)
                                "উৎস: ${if (isModeled) "মডেল করা (Open-Meteo স্যাটেলাইট)" else "মাপা (ক্যাম্পাস IoT সেন্সর)"} (কনফিডেন্স: $confidence%)"
                            else
                                "Source: ${if (isModeled) "Modeled (Open-Meteo Satellite)" else "Measured (Campus IoT Sensor)"} (Confidence: ${safeData?.confidenceLevelPct ?: 94}%)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (isBengali)
                                "Policy v1.2 ধারা ৪ (ডেটা ফলব্যাক ও ক্যাপ):\n" +
                                "ক্যাম্পাসে প্রত্যক্ষ IoT সেন্সর সচল থাকলে প্রত্যক্ষ মাপা ডেটা অগ্রাধিকার পায়। সেন্সর অফলাইন বা ৯০ মিনিটের পুরোনো হলে ওপেন-মেটিও মডেলড ডেটায় অটো-ফলব্যাক হয় এবং সুরক্ষার জন্য কঠোরতম ক্যাপ প্রযোজ্য হয়।"
                            else
                                "Policy v1.2 Section 4 (Data Fallback & Caps):\n" +
                                "Direct on-campus IoT sensors take top precedence when fresh. If offline or older than 90 minutes, the engine automatically falls back to Open-Meteo modeled telemetry with deterministic safety caps.",
                            fontSize = 12.sp,
                            lineHeight = 17.sp,
                            color = TextSecondary
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
            ) {
                Text(if (isBengali) "ঠিক আছে" else "Close", color = Color.White)
            }
        }
    )
}
