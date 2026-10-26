package com.airsafe.schools.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

@Composable
fun SchoolAnalyticsScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val analytics by viewModel.analyticsData.collectAsState()
    val isBengali by viewModel.isBengali.collectAsState()
    val auditLogs by viewModel.overrideAuditLogs.collectAsState()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        // Screen Header
        Text(
            text = if (isBengali) "স্কুল অ্যানালিটিক্স ও রিপোর্ট" else "School Analytics & Reports",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Text(
            text = if (isBengali)
                "সাপ্তাহিক নিরাপত্তা মূল্যায়ন ও সিদ্ধান্তের প্রভাব"
            else
                "Weekly Safety Review & Decision Impact",
            fontSize = 13.sp,
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Week Banner Card
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SafeGreenBackground),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.DateRange, contentDescription = null, tint = SafeGreen)
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = if (isBengali) analytics.weekLabelBn else analytics.weekLabelEn,
                    fontWeight = FontWeight.Bold,
                    color = SafeGreen,
                    fontSize = 14.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Core Metric: Lost Outdoor Minutes
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = if (isBengali) "বাতিল হওয়া আউটডোর সময়" else "Lost Outdoor Activity Time",
                    fontSize = 14.sp,
                    color = TextSecondary
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = "${analytics.lostOutdoorMinutes}",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Bold,
                        color = DangerRed
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isBengali) "মিনিট" else "minutes",
                        fontSize = 15.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                val diffMinutes = analytics.prevWeekLostMinutes - analytics.lostOutdoorMinutes
                Text(
                    text = if (isBengali)
                        "পূর্ববর্তী সপ্তাহের তুলনায় $diffMinutes মিনিট কম ক্ষতি হয়েছে।"
                    else
                        "$diffMinutes minutes less lost compared to previous week.",
                    fontSize = 12.sp,
                    color = SafeGreen
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Secondary Metrics Grid
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Hours above threshold
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCard),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.weight(1f)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = if (isBengali) "বিপদসীমার ওপরে" else "Above Threshold",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${analytics.hoursAboveThreshold} " + if (isBengali) "ঘণ্টা" else "hrs",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = CautionYellow
                    )
                }
            }

            // Measured vs Modeled Ratio
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCard),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.weight(1f)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = if (isBengali) "মাপা বনাম মডেল" else "Measured Ratio",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${analytics.measuredRatioPct}% " + if (isBengali) "মাপা" else "Measured",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = SafeGreen
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Decision Distribution Breakdown
        Text(
            text = if (isBengali) "সিদ্ধান্তের বিভাজন ও ওভাররাইড" else "Decision Breakdown & Overrides",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = TextPrimary
        )

        Spacer(modifier = Modifier.height(10.dp))

        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                AnalyticsRow(
                    label = if (isBengali) "নিরাপদ (PROCEED)" else "Safe (PROCEED)",
                    count = analytics.proceedCount,
                    color = SafeGreen
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Color.LightGray.copy(alpha = 0.3f))
                AnalyticsRow(
                    label = if (isBengali) "সতর্কতা (CAUTION)" else "Caution (PRECAUTIONS)",
                    count = analytics.cautionCount,
                    color = CautionYellow
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Color.LightGray.copy(alpha = 0.3f))
                AnalyticsRow(
                    label = if (isBengali) "ভেতরে নেওয়া (MOVE INDOORS)" else "Move Indoors (CRITICAL)",
                    count = analytics.moveIndoorsCount,
                    color = DangerRed
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Color.LightGray.copy(alpha = 0.3f))
                AnalyticsRow(
                    label = if (isBengali) "কোঅর্ডিনেটর ওভাররাইড" else "Coordinator Overrides",
                    count = analytics.overridesCount,
                    color = Color.DarkGray
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // F-11: Immutable Coordinator Override Audit Trail
        Text(
            text = if (isBengali) "অপরিবর্তনীয় ওভাররাইড অডিট ট্রেইল (F-11)" else "Immutable Override Audit Trail (F-11)",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = TextPrimary
        )

        Spacer(modifier = Modifier.height(10.dp))

        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                if (auditLogs.isEmpty()) {
                    Text(
                        text = if (isBengali) "কোনো কোঅর্ডিনেটর ওভাররাইড অডিট রেকর্ড নেই।" else "No coordinator override audit records found.",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                } else {
                    auditLogs.forEachIndexed { index, item ->
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = item.requestedDecision ?: "OVERRIDE",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = if (item.requestedDecision == "MOVE_INDOORS") DangerRed else CautionYellow
                                )
                                Text(
                                    text = item.timestamp?.take(16)?.replace("T", " ") ?: "",
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "${if (isBengali) "কারণ: " else "Reason: "}${item.reason ?: "-"}",
                                fontSize = 13.sp,
                                color = TextPrimary
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "${if (isBengali) "কোঅর্ডিনেটর: " else "By: "}${item.coordinatorEmail ?: "Coordinator"}",
                                    fontSize = 12.sp,
                                    color = TextSecondary
                                )
                                if (item.relaxesFloor) {
                                    Text(
                                        text = if (isBengali) "⚠️ নীতি শিথিলকরণ" else "⚠️ Relaxes Floor",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = DangerRed
                                    )
                                }
                            }
                            if (!item.expiresAt.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "${if (isBengali) "মেয়াদ শেষ: " else "Expires: "}${item.expiresAt?.take(16)?.replace("T", " ")}",
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                            }
                        }
                        if (index < auditLogs.size - 1) {
                            HorizontalDivider(
                                modifier = Modifier.padding(vertical = 10.dp),
                                color = Color.LightGray.copy(alpha = 0.3f)
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // F-14: Share / Export Weekly Report (Android Share Sheet)
        // F-14: Share / Export Weekly Report Summary
        Button(
            onClick = {
                val reportContent = buildString {
                    appendLine(if (isBengali) "📊 এয়ারসেফ স্কুল সাপ্তাহিক রিপোর্ট" else "📊 AirSafe Schools Weekly Report")
                    appendLine("---------------------------------------")
                    appendLine(if (isBengali) "সপ্তাহ: ${analytics.weekLabelBn}" else "Week: ${analytics.weekLabelEn}")
                    appendLine(if (isBengali) "বাতিল হওয়া আউটডোর মিনিট: ${analytics.lostOutdoorMinutes} মিনিট" else "Lost Outdoor Minutes: ${analytics.lostOutdoorMinutes} mins")
                    appendLine(if (isBengali) "বিপদসীমার ওপরে সময়: ${analytics.hoursAboveThreshold} ঘণ্টা" else "Hours Above Safety Threshold: ${analytics.hoursAboveThreshold} hrs")
                    appendLine(if (isBengali) "নিরাপদ সেশন: ${analytics.proceedCount}" else "Safe Sessions: ${analytics.proceedCount}")
                    appendLine(if (isBengali) "ভেতরে নেওয়া সেশন: ${analytics.moveIndoorsCount}" else "Move Indoors Sessions: ${analytics.moveIndoorsCount}")
                    appendLine(if (isBengali) "রেকর্ড করা ওভাররাইড: ${analytics.overridesCount}" else "Logged Overrides: ${analytics.overridesCount}")
                    appendLine(if (isBengali) "মাপা ডেটার অনুপাত: ${analytics.measuredRatioPct}%" else "Measured Sensor Ratio: ${analytics.measuredRatioPct}%")
                    appendLine("---------------------------------------")
                    appendLine("AirSafe Schools • Verified Decision Engine")
                }

                val sendIntent = Intent().apply {
                    action = Intent.ACTION_SEND
                    putExtra(Intent.EXTRA_TEXT, reportContent)
                    type = "text/plain"
                }
                val shareIntent = Intent.createChooser(sendIntent, if (isBengali) "সাপ্তাহিক রিপোর্ট শেয়ার করুন" else "Share Weekly Report")
                context.startActivity(shareIntent)
            },
            colors = ButtonDefaults.buttonColors(containerColor = SafeGreen),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(Icons.Default.Share, contentDescription = null, tint = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isBengali) "সাপ্তাহিক রিপোর্ট শেয়ার করুন" else "Share Weekly Report",
                fontWeight = FontWeight.Bold,
                color = Color.White,
                fontSize = 15.sp
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // F-14: Row-Level CSV Export for Governing Board / Analytics
        OutlinedButton(
            onClick = {
                val csvContent = viewModel.getWeeklyAnalyticsCsv()
                val sendIntent = Intent().apply {
                    action = Intent.ACTION_SEND
                    putExtra(Intent.EXTRA_TEXT, csvContent)
                    type = "text/csv"
                }
                val shareIntent = Intent.createChooser(sendIntent, if (isBengali) "রো-লেভেল CSV এক্সপোর্ট করুন" else "Export Row-Level CSV")
                context.startActivity(shareIntent)
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(Icons.Default.Download, contentDescription = null, tint = TextPrimary)
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isBengali) "রো-লেভেল CSV এক্সপোর্ট করুন" else "Export Row-Level CSV",
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                fontSize = 15.sp
            )
        }
    }
}

@Composable
fun AnalyticsRow(label: String, count: Int, color: Color) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, fontSize = 14.sp, color = TextPrimary)
        Text(
            text = "$count",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = color
        )
    }
}
