package com.airsafe.schools.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.data.model.TrendPoint
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

@Composable
fun TrendsScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val trends by viewModel.trendData.collectAsState()
    val isBengali by viewModel.isBengali.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = if (isBengali) "আজকের তাপমাত্রা ও বায়ুমান ট্রেন্ড" else "Today's Temperature & AQI Trend",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = if (isBengali) "স্কুল সময়ের ঘণ্টাভিত্তিক পরিসংখ্যান (Asia/Dhaka)" else "Hourly school timeline stats (Asia/Dhaka)",
            fontSize = 14.sp,
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Table Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFE0E0E0), RoundedCornerShape(8.dp))
                .padding(vertical = 10.dp, horizontal = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = if (isBengali) "সময়" else "Time", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(text = if (isBengali) "হিট ইনডেক্স" else "Heat Index", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(text = "US AQI", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(text = if (isBengali) "অবস্থা" else "Status", fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Trend Table Rows (Accessible List per U-6 & F-04)
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(trends) { item ->
                TrendRow(item, isBengali)
            }
        }
    }
}

@Composable
fun TrendRow(item: TrendPoint, isBengali: Boolean) {
    val (statusLabel, statusColor, bgColor) = if (item.isDangerous) {
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

    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor),
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                val label = if (isBengali) item.timeLabelBn else item.timeLabelEn
                contentDescription = "$label, $statusLabel, ${item.heatIndexC}°C, AQI ${item.aqi}"
            }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = if (isBengali) item.timeLabelBn else item.timeLabelEn, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
            Text(text = "${item.heatIndexC}°C", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
            Text(text = "${item.aqi}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
            Text(
                text = statusLabel,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = statusColor
            )
        }
    }
}
