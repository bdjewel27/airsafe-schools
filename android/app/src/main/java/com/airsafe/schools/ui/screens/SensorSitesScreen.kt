package com.airsafe.schools.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.R
import androidx.compose.ui.unit.sp
import com.airsafe.schools.data.model.SensorSite
import com.airsafe.schools.data.model.toBengaliDigits
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

@Composable
fun SensorSitesView(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val sites by viewModel.sensorSites.collectAsState()
    val isBengali by viewModel.isBengali.collectAsState()

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.sites_title),
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Spacer(modifier = Modifier.height(10.dp))

        sites.forEach { site ->
            SensorSiteCard(site = site, isBengali = isBengali)
            Spacer(modifier = Modifier.height(10.dp))
        }
    }
}

@Composable
fun SensorSiteCard(site: SensorSite, isBengali: Boolean) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                val tempStr = if (site.tempC != null) "${site.tempC} ডিগ্রি" else "তথ্য নেই"
                val pmStr = if (site.pm25Ugm3 != null) "${site.pm25Ugm3}" else "তথ্য নেই"
                contentDescription = "${site.nameBn}, তাপমাত্রা $tempStr, PM2.5 $pmStr"
            }
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Sensors,
                        contentDescription = null,
                        tint = SafeGreen,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isBengali) site.nameBn else site.nameEn,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (site.isOnline) SafeGreenBackground else Color(0xFFFFF3CD)
                ) {
                    Text(
                        text = if (site.isOnline) {
                            if (isBengali) "অনলাইন • ${site.lastUpdatedBn}" else "Live • ${site.lastUpdatedEn}"
                        } else {
                            if (isBengali) "অফলাইন • ${site.lastUpdatedBn}" else "Offline • ${site.lastUpdatedEn}"
                        },
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (site.isOnline) SafeGreen else Color(0xFF856404),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                MetricSmallItem(
                    modifier = Modifier.weight(1f),
                    label = if (isBengali) "হিট ইনডেক্স" else "Heat Index",
                    value = if (site.heatIndexC != null) "${site.heatIndexC.toString().toBengaliDigits(isBengali)}°C" else "--"
                )
                MetricSmallItem(
                    modifier = Modifier.weight(1f),
                    label = if (isBengali) "তাপমাত্রা" else "Temp",
                    value = if (site.tempC != null) "${site.tempC.toString().toBengaliDigits(isBengali)}°C" else "--"
                )
                MetricSmallItem(
                    modifier = Modifier.weight(1f),
                    label = if (isBengali) "আর্দ্রতা" else "Humidity",
                    value = if (site.rhPct != null) "${site.rhPct.toString().toBengaliDigits(isBengali)}%" else "--"
                )
                MetricSmallItem(
                    modifier = Modifier.weight(1f),
                    label = "PM2.5",
                    value = if (site.pm25Ugm3 != null) site.pm25Ugm3.toString().toBengaliDigits(isBengali) else "--"
                )
            }
        }
    }
}

@Composable
fun MetricSmallItem(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = label, fontSize = 11.sp, color = TextSecondary, maxLines = 1)
        Spacer(modifier = Modifier.height(2.dp))
        Text(text = value, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextPrimary, maxLines = 1)
    }
}
