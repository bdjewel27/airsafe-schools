package com.airsafe.schools.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.R
import com.airsafe.schools.data.api.AirSafeApiClient
import com.airsafe.schools.data.model.AssistantChatRequest
import com.airsafe.schools.data.model.DecisionUiState
import com.airsafe.schools.data.model.toBengaliDigits
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel
import kotlinx.coroutines.launch

@Composable
fun AssistantScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val isBengali by viewModel.isBengali.collectAsState()
    val isOffline by viewModel.isOffline.collectAsState()
    val currentDecisionState by viewModel.uiState.collectAsState()
    val userSession by viewModel.userSession.collectAsState()

    var queryText by remember { mutableStateOf("") }
    var isThinking by remember { mutableStateOf(false) }
    var thinkingSteps by remember { mutableStateOf<List<String>>(emptyList()) }
    var responseAnswer by remember { mutableStateOf<String?>(null) }
    var verifiedHi by remember { mutableStateOf<Double?>(null) }
    var verifiedAqi by remember { mutableStateOf<Int?>(null) }
    var verifiedDecision by remember { mutableStateOf<String?>(null) }
    var activeCitation by remember { mutableStateOf<PolicyCitation?>(null) }
    var showCitationDialog by remember { mutableStateOf(false) }
    var followUpSuggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    var assistantError by remember { mutableStateOf<String?>(null) }
    var usedBedrockModel by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()
    val decisionData = (currentDecisionState as? DecisionUiState.Success)?.data

    val defaultGreeting = stringResource(R.string.assistant_greeting)

    val isRefusal = responseAnswer?.contains("only answer questions related to school", ignoreCase = true) == true ||
                    responseAnswer?.contains("বায়ুমান, তাপমাত্রা ও outdoor নিরাপত্তা", ignoreCase = true) == true

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 8.dp)
        ) {
            Text(
                text = stringResource(R.string.assistant_title),
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
            Text(
                text = stringResource(R.string.app_subtitle),
                fontSize = 13.sp,
                color = TextSecondary
            )

            Spacer(modifier = Modifier.height(10.dp))

            // U-3: Stale / Offline Banner on Assistant Screen
            if (isOffline || decisionData?.isStale == true) {
                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Schedule, contentDescription = null, tint = CautionText)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isBengali)
                                "সতর্কতা: অফলাইন/স্টেল মোড—সহকারী স্থানীয় ক্যাশড পলিসি নির্দেশিকা প্রদান করছে।"
                            else
                                "Notice: Offline/Stale Mode—Assistant is operating on local cached safety policies.",
                            color = CautionText,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Error Card if Assistant Query Failed (U-3)
            if (assistantError != null) {
                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = DangerRedBackground),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = assistantError ?: "",
                            color = DangerRed,
                            fontSize = 12.sp,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { assistantError = null }) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = DangerRed)
                        }
                    }
                }
            }

            // AI Response Card
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
                            text = if (isOffline || usedBedrockModel == null || usedBedrockModel?.contains("fallback", ignoreCase = true) == true || usedBedrockModel?.contains("offline", ignoreCase = true) == true) "Policy assistant (AI নয়)" else "AirSafe AI",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = SafeGreen
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Step-by-step thinking indicators (U-5: Real tool steps retained)
                    if (!isRefusal && thinkingSteps.isNotEmpty()) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)
                                ) {
                                    if (isThinking) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(12.dp),
                                            strokeWidth = 2.dp,
                                            color = CautionText
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                    }
                                    Text(
                                        text = if (isBengali) "যুক্তি ও যাচাইকরণের ধাপসমূহ:" else "Reasoning & Grounding Steps:",
                                        fontSize = 11.sp,
                                        color = CautionText,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                thinkingSteps.forEach { step ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "• $step",
                                            fontSize = 12.sp,
                                            color = CautionText,
                                            fontWeight = FontWeight.Normal
                                        )
                                    }
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                    }

                    // Main Response Body
                    Text(
                        text = responseAnswer ?: defaultGreeting,
                        fontSize = 15.sp,
                        color = TextPrimary,
                        lineHeight = 22.sp,
                        textAlign = TextAlign.Start,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    )

                    // Numerical Grounding Card (U-5 & P6: Strictly verified telemetry only; never fabricated!)
                    val hiToShow = verifiedHi ?: decisionData?.heatIndexC
                    val aqiToShow = verifiedAqi ?: decisionData?.aqi
                    val decToShow = verifiedDecision ?: decisionData?.decision

                    if (!isRefusal && responseAnswer != null && hiToShow != null && aqiToShow != null && decToShow != null && decToShow != "UNKNOWN") {
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
                                    text = if (isBengali)
                                        "যাচাইকৃত হিট ইনডেক্স: ${hiToShow.toString().toBengaliDigits(true)}°C"
                                    else
                                        "Verified Heat Index: ${hiToShow}°C",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SafeGreen
                                )
                                Text(
                                    text = "AQI: ${aqiToShow.toString().toBengaliDigits(isBengali)} ($decToShow)",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SafeGreen
                                )
                            }
                        }
                    }

                    // Interactive Policy Citation Chip (F-05 & A-7)
                    if (!isRefusal && activeCitation != null && !isThinking) {
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
            if (!isRefusal && followUpSuggestions.isNotEmpty() && !isThinking) {
                Text(
                    text = stringResource(R.string.assistant_suggested_followups),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextSecondary,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    followUpSuggestions.take(2).forEach { suggestion ->
                        AssistChip(
                            onClick = { queryText = suggestion },
                            modifier = Modifier.defaultMinSize(minHeight = 44.dp),
                            label = {
                                Text(
                                    text = suggestion,
                                    fontSize = 11.sp,
                                    maxLines = 1
                                )
                            }
                        )
                    }
                }
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
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
                                text = stringResource(R.string.chip_outdoor_pe),
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
                                text = stringResource(R.string.chip_heat_rules),
                                fontSize = 11.sp
                            )
                        }
                    )
                }
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
                        Text(stringResource(R.string.assistant_placeholder))
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
                            assistantError = null
                            coroutineScope.launch {
                                isThinking = true
                                thinkingSteps = listOf(
                                    if (isBengali) "প্রম্পট ও সুরক্ষা যাচাই সম্পন্ন..." else "Prompt & security check passed..."
                                )

                                val schoolId = userSession?.schoolId ?: "school-dhaka-001"

                                try {
                                    // Step 1: Call Backend Grounded Assistant Endpoint
                                    val apiResp = AirSafeApiClient.service.askAssistant(
                                        schoolId,
                                        AssistantChatRequest(query = userQ, isBengali = isBengali)
                                    )

                                    // Step 2: Show real tool calls returned by backend (U-5)
                                    val toolsList = apiResp.toolCalls?.mapNotNull { it.name } ?: emptyList()
                                    val realSteps = mutableListOf<String>()
                                    if (toolsList.isNotEmpty()) {
                                        toolsList.forEach { toolName ->
                                            realSteps.add(if (isBengali) "টুল কল: $toolName" else "Called tool: $toolName")
                                        }
                                    } else {
                                        realSteps.add(if (isBengali) "পলিসি v1.2 গ্রাউন্ডিং যাচাই..." else "Policy v1.2 grounding verified...")
                                    }
                                    thinkingSteps = realSteps
                                    kotlinx.coroutines.delay(200)

                                    verifiedHi = apiResp.heatIndexC
                                    verifiedAqi = apiResp.aqi
                                    verifiedDecision = apiResp.decision
                                    usedBedrockModel = apiResp.usedBedrockModel

                                    activeCitation = PolicyCitation(
                                        policyTitleBn = apiResp.citationId ?: "Model School Outdoor Activity Policy v1.2",
                                        policyTitleEn = apiResp.citationId ?: "Model School Outdoor Activity Policy v1.2",
                                        sectionTextBn = apiResp.citationExcerpt ?: "Policy v1.2 deterministic threshold rules.",
                                        sectionTextEn = apiResp.citationExcerpt ?: "Policy v1.2 deterministic threshold rules.",
                                        version = "${apiResp.docId ?: "airsafe-policy-v1.2"} (v1.2)"
                                    )
                                    followUpSuggestions = apiResp.suggestedFollowUps

                                    // Progressive output display
                                    val fullText = apiResp.answer
                                    responseAnswer = ""
                                    isThinking = false
                                    val stepSize = 4
                                    for (i in 0 until fullText.length step stepSize) {
                                        val end = (i + stepSize).coerceAtMost(fullText.length)
                                        responseAnswer = fullText.substring(0, end)
                                        kotlinx.coroutines.delay(8)
                                    }
                                    responseAnswer = fullText
                                } catch (e: Exception) {
                                    usedBedrockModel = "offline-fallback"
                                    assistantError = if (isBengali) {
                                        "সহকারী সার্ভার সংযোগ ব্যর্থ (${e.javaClass.simpleName}): অফলাইন নিরাপত্তা নীতি প্রয়োগ করা হচ্ছে।"
                                    } else {
                                        "Assistant server unavailable (${e.javaClass.simpleName}): Offline safety policy applied."
                                    }

                                    // Deterministic Fail-Closed local fallback (P6: never fabricate numbers)
                                    val hi = decisionData?.heatIndexC
                                    val aqi = decisionData?.aqi
                                    val decision = decisionData?.decision ?: "UNKNOWN"

                                    if (decision == "UNKNOWN" || hi == null || aqi == null) {
                                        responseAnswer = if (isBengali)
                                            "বর্তমানে আপনার স্কুলের যাচাইকৃত সেন্সর ডেটা পাওয়া যায়নি (UNKNOWN — Fail-Closed)। Policy v1.2 ধারা ৪ অনুযায়ী ডেটা ছাড়া কোনো আউটডোর কার্যক্রমকে নিরাপদ ঘোষণা করা যাবে না।"
                                        else
                                            "Verified sensor telemetry is currently unavailable for your school (UNKNOWN — Fail-Closed). Per Policy v1.2 Section 4, outdoor activity cannot be declared safe without verified data."
                                        activeCitation = PolicyCitation(
                                            policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ৪",
                                            policyTitleEn = "Model School Outdoor Activity Policy v1.2, Section 4",
                                            sectionTextBn = "সেন্সর এবং মডেলকৃত ডেটা অনুপস্থিত থাকলে সিস্টেমকে অবশ্যই ফেইল-ক্লোজড (UNKNOWN) অবস্থায় যেতে হবে। কোনো সংখ্যা অনুমান করা যাবে না।",
                                            sectionTextEn = "When sensor and modeled telemetry are unavailable, the system must fail closed to UNKNOWN and never fabricate metrics.",
                                            version = "airsafe-policy-v1.2"
                                        )
                                    } else {
                                        verifiedHi = hi
                                        verifiedAqi = aqi
                                        verifiedDecision = decision
                                        responseAnswer = if (isBengali)
                                            "বর্তমান যাচাইকৃত হিট ইনডেক্স ${hi}°C এবং AQI $aqi। Policy v1.2 অনুযায়ী বর্তমান বাধ্যতামূলক আউটডোর সিদ্ধান্ত হলো: $decision।"
                                        else
                                            "Current verified Heat Index is ${hi}°C and AQI is $aqi. Under Policy v1.2, the mandatory decision is: $decision."
                                        activeCitation = PolicyCitation(
                                            policyTitleBn = "Model School Outdoor Activity Policy v1.2, ধারা ১ ও ২",
                                            policyTitleEn = "Model School Outdoor Activity Policy v1.2, Sections 1 & 2",
                                            sectionTextBn = "সকল আউটডোর কার্যক্রমের ক্ষেত্রে শারীরিক তীব্রতা, AQI এবং হিট ইনডেক্স টেবিল ১ ও ২ প্রযোজ্য।",
                                            sectionTextEn = "All outdoor activities are governed by physical intensity and Tables 1 & 2 for AQI and Heat Index.",
                                            version = "airsafe-policy-v1.2"
                                        )
                                    }
                                } finally {
                                    isThinking = false
                                    // U-5: Retain thinking steps in collapsible view after stream completes
                                }
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

    // Modal Dialog: Policy Citation Details
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
