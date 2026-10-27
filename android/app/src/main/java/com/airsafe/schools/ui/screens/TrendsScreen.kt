package com.airsafe.schools.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.R
import com.airsafe.schools.data.model.TrendPoint
import com.airsafe.schools.data.model.toBengaliDigits
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

@Composable
fun TrendsScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val trends by viewModel.trendData.collectAsState()
    val isBengali by viewModel.isBengali.collectAsState()
    val isOffline by viewModel.isOffline.collectAsState()
    val isTrendsLoading by viewModel.isTrendsLoading.collectAsState()
    val trendsError by viewModel.trendsError.collectAsState()
    val selectedRange by viewModel.selectedTrendRange.collectAsState()
    val compareSiteId by viewModel.compareSiteId.collectAsState()
    val periodLabel by viewModel.trendPeriodLabel.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = if (isBengali) "তাপমাত্রা ও বায়ুমান ট্রেন্ড" else "Temperature & AQI Trends",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Spacer(modifier = Modifier.height(2.dp))

        Text(
            text = periodLabel,
            fontSize = 13.sp,
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(10.dp))

        // U-3: Stale / Offline Warning Banner on Trends Screen
        if (isOffline) {
            Card(
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp)
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.CloudOff, contentDescription = null, tint = CautionText)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isBengali)
                            "অফলাইন মোড: ক্যাশড ঐতিহাসিক ট্রেন্ড তথ্য দেখানো হচ্ছে।"
                        else
                            "Offline Mode: Displaying cached historical trend telemetry.",
                        color = CautionText,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // 1. Time Range Selector Chips: 24h / 7d / 30d (F-04)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val ranges = listOf(
                Triple("24h", "২৪ ঘণ্টা", "24 Hours"),
                Triple("7d", "৭ দিন", "7 Days"),
                Triple("30d", "৩০ দিন", "30 Days")
            )
            ranges.forEach { (key, bn, en) ->
                val isSelected = selectedRange == key
                FilterChip(
                    selected = isSelected,
                    onClick = { viewModel.setTrendRange(key) },
                    label = {
                        Text(
                            text = if (isBengali) bn else en,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // 2. Two-Site Comparison Selector (F-04)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = if (isBengali) "সাইট তুলনা:" else "Compare:",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextSecondary
            )

            val isSingle = compareSiteId == null
            FilterChip(
                selected = isSingle,
                onClick = { viewModel.setComparisonSite(null) },
                label = { Text(if (isBengali) "একক (মাঠ)" else "Field only", fontSize = 11.sp) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer
                )
            )

            val isComparing = compareSiteId != null
            FilterChip(
                selected = isComparing,
                onClick = {
                    val target = if (isComparing) null else "courtyard"
                    viewModel.setComparisonSite(target)
                },
                label = { Text(if (isBengali) "মাঠ বনাম উঠান" else "Field vs Courtyard", fontSize = 11.sp) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer
                )
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // 3. School Hours Shading Indicator Banner (08:00 - 16:00 Asia/Dhaka per F-04)
        Card(
            shape = RoundedCornerShape(6.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F2FD)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(Color(0xFF1976D2), RoundedCornerShape(2.dp))
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isBengali)
                        "স্কুল সময় শেডিং: সকাল ৮:০০ – বিকাল ৪:০০ (Asia/Dhaka)"
                    else
                        "School Hours Shading: 8:00 AM – 4:00 PM (Asia/Dhaka)",
                    fontSize = 11.sp,
                    color = Color(0xFF0D47A1),
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // 4. Content Area: Loading Skeleton, Error State, or Accessible Table (U-3)
        when {
            isTrendsLoading -> {
                TrendsSkeleton()
            }
            trendsError != null && trends.isEmpty() -> {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = CautionYellowBackground),
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = CautionText, modifier = Modifier.size(36.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = trendsError ?: "",
                            fontSize = 13.sp,
                            color = CautionText,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { viewModel.loadTrends() },
                            colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (isBengali) "পুনরায় চেষ্টা করুন" else "Retry")
                        }
                    }
                }
            }
            else -> {
                // Table Header (Accessible Table per U-6 & F-04)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFE8ECEF), RoundedCornerShape(8.dp))
                        .padding(vertical = 10.dp, horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isBengali) "সময় / তারিখ" else "Time/Date",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        modifier = Modifier.weight(1.3f)
                    )
                    Text(
                        text = stringResource(R.string.metric_heat_index),
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1.3f)
                    )
                    Text(
                        text = "US AQI",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1.0f)
                    )
                    Text(
                        text = if (isBengali) "অবস্থা" else "Status",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        textAlign = TextAlign.End,
                        modifier = Modifier.weight(1.1f)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // 5. Trend Table Rows with School Hours Shading & Site Comparison (F-04)
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(trends) { item ->
                        TrendRow(item, isBengali, compareSiteId != null)
                    }
                }
            }
        }
    }
}

@Composable
fun TrendsSkeleton() {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
    ) {
        repeat(5) {
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFEEEEEE)),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {}
        }
    }
}

@Composable
fun TrendRow(item: TrendPoint, isBengali: Boolean, isComparisonActive: Boolean = false) {
    val (statusLabel, statusColor, baseBgColor) = if (item.isDangerous) {
        Triple(
            if (isBengali) "ঝুঁকিপূর্ণ" else "Danger",
            DangerRed,
            DangerRedBackground
        )
    } else {
        Triple(
            if (isBengali) "নিরাপদ" else "Safe",
            SafeGreen,
            SafeGreenBackground
        )
    }

    // School Hours Shading (F-04): Apply subtle blue tint during 08:00 - 16:00
    val rowBgColor = if (item.isSchoolHours || item.isShaded) {
        if (item.isDangerous) Color(0xFFFFEBEE) else Color(0xFFF0F7FF)
    } else {
        baseBgColor
    }

    val cardBorder = if (item.isSchoolHours || item.isShaded) {
        Modifier.border(1.dp, Color(0xFF90CAF9), RoundedCornerShape(8.dp))
    } else {
        Modifier
    }

    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = rowBgColor),
        modifier = Modifier
            .fillMaxWidth()
            .then(cardBorder)
            .semantics {
                val label = if (isBengali) item.timeLabelBn else item.timeLabelEn
                val hi = item.heatIndexC.toString().toBengaliDigits(isBengali)
                val aqiStr = item.aqi.toString().toBengaliDigits(isBengali)
                contentDescription = "$label, হিট ইনডেক্স $hi ডিগ্রি, AQI $aqiStr, অবস্থা $statusLabel"
            }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1.3f)) {
                Text(
                    text = if (isBengali) item.timeLabelBn else item.timeLabelEn,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimary
                )
                if (item.isSchoolHours) {
                    Text(
                        text = if (isBengali) "স্কুল সময়" else "School hr",
                        fontSize = 10.sp,
                        color = Color(0xFF1976D2),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1.3f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "${item.heatIndexC.toString().toBengaliDigits(isBengali)}°C",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (item.heatIndexC >= 38.0) DangerRed else TextPrimary
                )
                if (isComparisonActive && item.deltaHeatIndexC != null) {
                    val deltaStr = item.deltaHeatIndexC.toString().toBengaliDigits(isBengali)
                    val sign = if (item.deltaHeatIndexC > 0) "+$deltaStr" else deltaStr
                    Text(
                        text = "$sign°C (উঠান)",
                        fontSize = 10.sp,
                        color = if (item.deltaHeatIndexC > 0) DangerRed else SafeGreen,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1.0f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = item.aqi.toString().toBengaliDigits(isBengali),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (item.aqi >= 150) DangerRed else TextPrimary
                )
                if (isComparisonActive && item.deltaAqi != null) {
                    val deltaAqiStr = item.deltaAqi.toString().toBengaliDigits(isBengali)
                    val sign = if (item.deltaAqi > 0) "+$deltaAqiStr" else deltaAqiStr
                    Text(
                        text = "$sign (উঠান)",
                        fontSize = 10.sp,
                        color = if (item.deltaAqi > 0) DangerRed else SafeGreen,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Text(
                text = statusLabel,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = statusColor,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1.1f)
            )
        }
    }
}
