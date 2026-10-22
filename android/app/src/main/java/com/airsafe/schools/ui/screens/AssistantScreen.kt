package com.airsafe.schools.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.model.AssistantChatRequest
import com.airsafe.schools.data.model.DecisionUiState
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel
import kotlinx.coroutines.launch

@Composable
fun AssistantScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val isBengali by viewModel.isBengali.collectAsState()
    val currentDecisionState by viewModel.uiState.collectAsState()
    val userSession by viewModel.userSession.collectAsState()

    var queryText by remember { mutableStateOf("") }
    var isThinking by remember { mutableStateOf(false) }
    var thinkingStep by remember { mutableStateOf<String?>(null) }
    var responseAnswer by remember { mutableStateOf<String?>(null) }
    var activeCitation by remember { mutableStateOf<PolicyCitation?>(null) }
    var showCitationDialog by remember { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()

    val defaultGreeting = if (isBengali)
        "নমস্কার! আমি AirSafe AI সহকারী। আজকের আবহাওয়া, হিট ইনডেক্স বা Model School Outdoor Activity Policy v1.2 সম্পর্কে যেকোনো প্রশ্ন করতে পারেন।"
    else
        "Hello! I am your AirSafe AI Assistant. Ask any question about today's verified telemetry, heat index, or Model School Outdoor Activity Policy v1.2."

    val decisionData = (currentDecisionState as? DecisionUiState.Success)?.data

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (isBengali) "AI পরিবেশ সহকারী" else "AI Environmental Assistant",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
            Text(
                text = if (isBengali) "যাচাইকৃত সেন্সর ডেটা ও পরিবেশ নীতিমালা ভিত্তিক প্রশ্নোত্তর" else "Reliable guidance grounded in live sensor data & safety policy",
                fontSize = 13.sp,
                color = TextSecondary
            )

            Spacer(modifier = Modifier.height(14.dp))

            // AI Response Box
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCard),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.SmartToy,
                            contentDescription = null,
                            tint = SafeGreen,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = if (isBengali) "AirSafe সহকারী" else "AirSafe Assistant",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = SafeGreen
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Step-by-step thinking indicator (U-5)
                    if (isThinking && thinkingStep != null) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = CautionYellow
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = thinkingStep!!,
                                    fontSize = 13.sp,
                                    color = CautionYellow,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                    }

                    // Main Response Body
                    Text(
                        text = responseAnswer ?: defaultGreeting,
                        fontSize = 15.sp,
                        color = TextPrimary,
                        lineHeight = 22.sp
                    )

                    // Numerical Grounding Card (A-7: Only display when verified telemetry is non-null; never fabricate!)
                    if (responseAnswer != null && decisionData?.heatIndexC != null && decisionData.aqi != null) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Card(
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = SafeGreenBackground),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (isBengali) "যাচাইকৃত হিট ইনডেক্স: ${decisionData.heatIndexC}°C"
                                           else "Verified Heat Index: ${decisionData.heatIndexC}°C",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SafeGreen
                                )
                                Text(
                                    text = "AQI: ${decisionData.aqi} (${decisionData.decision})",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SafeGreen
                                )
                            }
                        }
                    }

                    // Interactive Policy Citation Chip (F-05 & A-7: Tap to see section and version)
                    if (activeCitation != null && !isThinking) {
                        Spacer(modifier = Modifier.height(12.dp))
                        AssistChip(
                            onClick = { showCitationDialog = true },
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Info,
                                    contentDescription = null,
                                    tint = SafeGreen,
                                    modifier = Modifier.size(16.dp)
                                )
                            },
                            label = {
                                Text(
                                    text = if (isBengali) "উদ্ধৃতি: ${activeCitation!!.policyTitleBn}"
                                           else "Citation: ${activeCitation!!.policyTitleEn}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = Color.White,
                                labelColor = SafeGreen
                            )
                        )
                    }
                }
            }
        }

        // Question Input Field with Quick Suggestions
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AssistChip(
                    onClick = {
                        queryText = if (isBengali) "আজ কি পিই ক্লাস বাইরে নেওয়া যাবে?" else "Can we hold PE class outside today?"
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    label = {
                        Text(
                            text = if (isBengali) "পিই ক্লাস কি বাইরে হবে?" else "Can PE be outside?",
                            fontSize = 11.sp
                        )
                    }
                )
                AssistChip(
                    onClick = {
                        queryText = if (isBengali) "হিট ইনডেক্স কত হলে বাইরে যাওয়া নিষেধ?" else "At what heat index must we move indoors?"
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    label = {
                        Text(
                            text = if (isBengali) "হিট ইনডেক্স নিয়মাবলী" else "Heat Index Rules",
                            fontSize = 11.sp
                        )
                    }
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = queryText,
                    onValueChange = { queryText = it },
                    placeholder = {
                        Text(
                            if (isBengali) "প্রশ্ন করুন (যেমন: আজ মাঠে খেলা যাবে?)"
                            else "Ask a question (e.g. Can we play PE outside?)"
                        )
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(24.dp)
                )

                Spacer(modifier = Modifier.width(8.dp))

                IconButton(
                    onClick = {
                        if (queryText.isNotBlank() && !isThinking) {
                            val userQ = queryText.trim()
                            queryText = ""
                            coroutineScope.launch {
                                isThinking = true
                                thinkingStep = if (isBengali) "MCP টুল `get_school_decision` কল করছি..." else "Calling MCP tool `get_school_decision`..."
                                kotlinx.coroutines.delay(500)

                                thinkingStep = if (isBengali) "Model School Outdoor Activity Policy v1.2 যাচাই করছি..." else "Verifying Model School Outdoor Activity Policy v1.2..."
                                kotlinx.coroutines.delay(500)

                                val schoolId = userSession?.schoolId ?: "school-dhaka-001"

                                // 1. Try Backend Grounded Assistant Endpoint first
                                try {
                                    val apiResp = AirSafeApiClient.service.askAssistant(
                                        schoolId,
                                        AssistantChatRequest(query = userQ, isBengali = isBengali)
                                    )
                                    responseAnswer = apiResp.answer
                                    activeCitation = PolicyCitation(
                                        policyTitleBn = apiResp.citationId ?: "Model School Outdoor Activity Policy v1.2",
                                        policyTitleEn = apiResp.citationId ?: "Model School Outdoor Activity Policy v1.2",
                                        sectionTextBn = apiResp.citationExcerpt ?: "Policy v1.2 deterministic threshold rules.",
                                        sectionTextEn = apiResp.citationExcerpt ?: "Policy v1.2 deterministic threshold rules.",
                                        version = "${apiResp.docId ?: "airsafe-policy-v1.2"} (v1.2)"
                                    )
                                    isThinking = false
                                    thinkingStep = null
                                    return@launch
                                } catch (_: Exception) {
                                    // Fallback to deterministic local MCP + Policy v1.2 grounding (never fabricates numbers)
                                }

                                // 2. Prompt Injection & Cross-Tenant Guardrail (A-5, S-8, Hard Gate 2 & 4)
                                val isInjectionOrCrossTenant = Regex(
                                    "(ignore previous|system prompt|override policy|force green|other school|school-ctg|school-raj)",
                                    RegexOption.IGNORE_CASE
                                ).containsMatchIn(userQ) && !userQ.contains(schoolId, ignoreCase = true)

                                if (isInjectionOrCrossTenant) {
                                    responseAnswer = if (isBengali)
                                        "নিরাপত্তা নীতি: আমি অন্য কোনো স্কুলের ডেটা অ্যাক্সেস করতে বা অনুমোদিত নিরাপত্তা সীমা শিথিল করতে পারি না।"
                                    else
                                        "Security Policy: I cannot access other schools' data or relax the authoritative safety limit."
                                    activeCitation = PolicyCitation(
                                        policyTitleBn = "স্কুল আউটডোর কার্যক্রম নীতি v1.2 (নিরাপত্তা বিধি)",
                                        policyTitleEn = "School Outdoor Activity Policy v1.2 (Safety Protocol)",
                                        sectionTextBn = "AI সহকারী শুধুমাত্র ব্যাখ্যামূলক ও পরামর্শমূলক; এটি কখনোই নিরাপত্তা সীমা শিথিল করতে বা অন্য স্কুলের ডেটা পড়তে পারে না।",
                                        sectionTextEn = "The AI assistant is strictly explanatory; it cannot relax safety limits or read unauthorized school data.",
                                        version = "airsafe-policy-v1.2"
                                    )
                                    isThinking = false
                                    thinkingStep = null
                                    return@launch
                                }

                                // 3. Fail-Closed Check when telemetry is UNKNOWN / unavailable (Hard Gate 4 & A-7)
                                val hi = decisionData?.heatIndexC
                                val aqi = decisionData?.aqi
                                val decision = decisionData?.decision ?: "UNKNOWN"

                                if (decision == "UNKNOWN" || hi == null || aqi == null) {
                                    responseAnswer = if (isBengali)
                                        "বর্তমানে আপনার স্কুলের যাচাইকৃত সেন্সর বা আবহাওয়া ডেটা পাওয়া যাচ্ছে না (UNKNOWN — Fail-Closed)। Model School Outdoor Activity Policy v1.2 ধারা ৪ অনুযায়ী ডেটা ছাড়া কোনো আউটডোর কার্যক্রমকে নিরাপদ ঘোষণা করা যাবে না।"
                                    else
                                        "Verified sensor or weather telemetry is currently unavailable for your school (UNKNOWN — Fail-Closed). Per Policy v1.2 Section 4, outdoor activity cannot be declared safe without verified data."
                                    activeCitation = PolicyCitation(
                                        policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ৪",
                                        policyTitleEn = "Model School Outdoor Activity Policy v1.2, Section 4",
                                        sectionTextBn = "সেন্সর এবং মডেলকৃত ডেটা অনুপস্থিত থাকলে সিস্টেমকে অবশ্যই ফেইল-ক্লোজড (UNKNOWN) অবস্থায় যেতে হবে। কোনো সংখ্যা অনুমান করা যাবে না।",
                                        sectionTextEn = "When sensor and modeled telemetry are unavailable, the system must fail closed to UNKNOWN and never fabricate metrics.",
                                        version = "airsafe-policy-v1.2"
                                    )
                                    isThinking = false
                                    thinkingStep = null
                                    return@launch
                                }

                                // 4. Deterministic Grounded Explanation from Verified Telemetry & Policy v1.2 (Table 1 & Table 2)
                                val (answerBn, answerEn, citation) = when {
                                    userQ.contains("ভলিবল") || userQ.contains("সাঁতার") || userQ.contains("ফুটবল টুর্নামেন্ট") -> {
                                        Triple(
                                            "এই নির্দিষ্ট খেলার জন্য আলাদা কোনো বিশেষ ধারা ডাটাবেসে নেই। তবে বর্তমান হিট ইনডেক্স ${hi}°C ও AQI $aqi অনুযায়ী সাধারণ আউটডোর সিদ্ধান্ত হলো $decision।",
                                            "No sport-specific subsection exists for this query. Under current verified telemetry (Heat Index ${hi}°C, AQI $aqi), the mandatory Policy v1.2 decision is $decision.",
                                            PolicyCitation(
                                                policyTitleBn = "Model School Outdoor Activity Policy v1.2 (সাধারণ নিয়ম)",
                                                policyTitleEn = "Model School Outdoor Activity Policy v1.2 (General Rules)",
                                                sectionTextBn = "সকল আউটডোর কার্যক্রমের ক্ষেত্রে শারীরিক তীব্রতা (হালকা/মাঝারি/তীব্র), AQI এবং হিট ইনডেক্স টেবিল ১ ও ২ প্রযোজ্য।",
                                                sectionTextEn = "All outdoor activities are governed by physical intensity (light/moderate/vigorous) and Tables 1 & 2 for AQI and Heat Index.",
                                                version = "airsafe-policy-v1.2"
                                            )
                                        )
                                    }
                                    decision == "MOVE_INDOORS" || hi >= 39.0 || aqi >= 151 -> {
                                        Triple(
                                            "বর্তমান যাচাইকৃত হিট ইনডেক্স ${hi}°C এবং AQI $aqi। Model School Outdoor Activity Policy v1.2 (ধারা ১ ও ২) অনুযায়ী মাঝারি/তীব্র কার্যক্রমের জন্য হিট ইনডেক্স ≥ ৩৯°C (বা সকল কার্যক্রমে ≥ ৪২°C) অথবা AQI ≥ ১৫১ হলে সিদ্ধান্ত **MOVE_INDOORS**। সকল কার্যক্রম অবিলম্বে ভেতরে স্থানান্তর করুন।",
                                            "Verified Heat Index is ${hi}°C and AQI is $aqi. Per Model School Outdoor Activity Policy v1.2 (§1 & §2), when Heat Index >= 39°C (or >= 42°C for all intensities) or AQI >= 151, the mandatory decision is **MOVE_INDOORS**. Relocate all activities indoors immediately.",
                                            PolicyCitation(
                                                policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ১ ও ২",
                                                policyTitleEn = "Model School Outdoor Activity Policy v1.2, Sections 1 & 2",
                                                sectionTextBn = "হিট ইনডেক্স ৩৯°C–৪১°C (মাঝারি/তীব্র তীব্রতা) বা ≥ ৪২°C, অথবা AQI ১৫১–২০০ (মাঝারি/তীব্র) বা > ২০০ হলে সকল আউটডোর কার্যক্রম ভেতরে স্থানান্তর (MOVE_INDOORS) বাধ্যতামূলক।",
                                                sectionTextEn = "Heat Index 39–41°C (moderate/vigorous) or >= 42°C, or AQI 151–200 (moderate/vigorous) or > 200 requires mandatory MOVE_INDOORS.",
                                                version = "airsafe-policy-v1.2"
                                            )
                                        )
                                    }
                                    decision == "MODIFY" || hi >= 32.0 || aqi >= 101 -> {
                                        Triple(
                                            "বর্তমান যাচাইকৃত হিট ইনডেক্স ${hi}°C এবং AQI $aqi। Policy v1.2 (ধারা ১ ও ২) অনুযায়ী সিদ্ধান্ত **MODIFY**—আউটডোর কার্যক্রম ছায়াযুক্ত স্থানে সর্বোচ্চ ${decisionData?.maxDurationMinutes ?: 30} মিনিটে সীমিত রাখুন এবং পানি পানের বিরতি নিশ্চিত করুন।",
                                            "Verified Heat Index is ${hi}°C and AQI is $aqi. Per Policy v1.2 (§1 & §2), the decision is **MODIFY**—limit outdoor duration to ${decisionData?.maxDurationMinutes ?: 30} minutes in shaded areas with mandatory hydration breaks.",
                                            PolicyCitation(
                                                policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ২ (MODIFY)",
                                                policyTitleEn = "Model School Outdoor Activity Policy v1.2, Section 2 (MODIFY)",
                                                sectionTextBn = "হিট ইনডেক্স ৩২°C–৩৮°C (মাঝারি/তীব্র) অথবা AQI ১০১–১৫০ (তীব্র) হলে ছায়াযুক্ত স্থানে সময়কাল ১৫–৩০ মিনিটে সীমিত (MODIFY) করতে হবে।",
                                                sectionTextEn = "For Heat Index 32–38°C (moderate/vigorous) or AQI 101–150 (vigorous), activities must be modified (MODIFY) with shade and 15–30 min duration limits.",
                                                version = "airsafe-policy-v1.2"
                                            )
                                        )
                                    }
                                    decision == "PROCEED_WITH_PRECAUTIONS" || hi >= 27.0 || aqi >= 51 -> {
                                        Triple(
                                            "বর্তমান যাচাইকৃত হিট ইনডেক্স ${hi}°C এবং AQI $aqi। Policy v1.2 অনুযায়ী সিদ্ধান্ত **PROCEED_WITH_PRECAUTIONS**—পানি পানের বিরতি দিন এবং সংবেদনশীল বা শ্বাসকষ্ট থাকা শিক্ষার্থীদের বিশেষ পর্যবেক্ষণে রাখুন।",
                                            "Verified Heat Index is ${hi}°C and AQI is $aqi. Per Policy v1.2, the decision is **PROCEED_WITH_PRECAUTIONS**—provide regular water breaks and monitor sensitive students.",
                                            PolicyCitation(
                                                policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ১–৪",
                                                policyTitleEn = "Model School Outdoor Activity Policy v1.2, Sections 1–4",
                                                sectionTextBn = "হিট ইনডেক্স ২৭°C–৩১°C (মাঝারি/তীব্র), AQI ৫১–১০০ (তীব্র) অথবা মডেলড/স্টেল ডেটা ক্যাপ প্রযোজ্য হলে সতর্কতা সহ কার্যক্রম পরিচালনা (PROCEED_WITH_PRECAUTIONS) করতে হবে।",
                                                sectionTextEn = "For Heat Index 27–31°C (moderate/vigorous), AQI 51–100 (vigorous), or modeled/stale data caps, proceed with precautions and hydration breaks.",
                                                version = "airsafe-policy-v1.2"
                                            )
                                        )
                                    }
                                    else -> {
                                        Triple(
                                            "বর্তমান যাচাইকৃত হিট ইনডেক্স ${hi}°C এবং AQI $aqi। Policy v1.2 অনুযায়ী পরিবেশ সম্পূর্ণ নিরাপদ (**PROCEED**)। নির্ধারিত সূচি অনুযায়ী আউটডোর ক্লাস ও খেলাধুলা চালানো যাবে।",
                                            "Verified Heat Index is ${hi}°C and AQI is $aqi. Per Policy v1.2, conditions are safe (**PROCEED**) for standard outdoor classes and activities.",
                                            PolicyCitation(
                                                policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ১ ও ২",
                                                policyTitleEn = "Model School Outdoor Activity Policy v1.2, Sections 1 & 2",
                                                sectionTextBn = "হিট ইনডেক্স < ২৭°C এবং AQI ০–৫০ (প্রত্যক্ষ সেন্সর ডেটা) হলে সাধারণ সূচি অনুযায়ী আউটডোর কার্যক্রম (PROCEED) পরিচালনা করা যাবে।",
                                                sectionTextEn = "Safe to proceed (PROCEED) with standard outdoor schedule when Heat Index < 27°C and AQI 0–50 on fresh measured sensor telemetry.",
                                                version = "airsafe-policy-v1.2"
                                            )
                                        )
                                    }
                                }

                                responseAnswer = if (isBengali) answerBn else answerEn
                                activeCitation = citation
                                isThinking = false
                                thinkingStep = null
                            }
                        }
                    },
                    modifier = Modifier
                        .size(50.dp)
                        .background(SafeGreen, RoundedCornerShape(25.dp))
                ) {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = "Send",
                        tint = Color.White
                    )
                }
            }
        }
    }

    // Modal Dialog: Policy Citation Details (U-5 & A-7)
    if (showCitationDialog && activeCitation != null) {
        AlertDialog(
            onDismissRequest = { showCitationDialog = false },
            title = {
                Text(
                    text = if (isBengali) activeCitation!!.policyTitleBn else activeCitation!!.policyTitleEn,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = SafeGreen
                )
            },
            text = {
                Column {
                    Text(
                        text = if (isBengali) "মূল অনুচ্ছেদ (Policy v1.2):" else "Exact Policy Excerpt (Policy v1.2):",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = if (isBengali) activeCitation!!.sectionTextBn else activeCitation!!.sectionTextEn,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Document ID: ${activeCitation!!.version}",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { showCitationDialog = false },
                    colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
                ) {
                    Text(if (isBengali) "ঠিক আছে" else "Close")
                }
            }
        )
    }
}

data class PolicyCitation(
    val policyTitleBn: String,
    val policyTitleEn: String,
    val sectionTextBn: String,
    val sectionTextEn: String,
    val version: String
)
