package com.airsafe.schools.ui.screens.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.data.model.ActivityScheduleItem
import com.airsafe.schools.ui.theme.*

@Composable
fun RoutineScheduleSection(
    activities: List<ActivityScheduleItem>,
    isBengali: Boolean,
    modifier: Modifier = Modifier
) {
    if (activities.isEmpty()) return

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = Color.White.copy(alpha = 0.95f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (isBengali) "📅 অ্যাক্টিভিটি ও সময়সূচি" else "📅 Activity Schedule",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = SafeGreen
                )
                Text(
                    text = if (isBengali) "${activities.size}টি সেশন" else "${activities.size} sessions",
                    fontSize = 11.sp,
                    color = TextSecondary
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            activities.forEach { act ->
                val actStatusColor = when (act.status?.uppercase()) {
                    "RED" -> DangerRed
                    "ORANGE" -> ModifyOrange
                    "YELLOW" -> CautionYellow
                    else -> SafeGreen
                }
                val actName = if (isBengali) (act.nameBn ?: act.nameEn ?: "") else (act.nameEn ?: act.nameBn ?: "")
                val isCurrentAct = act.isCurrent == true

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (isCurrentAct) SafeGreen.copy(alpha = 0.08f) else Color(0xFFF9FAFB),
                    border = if (isCurrentAct) BorderStroke(1.dp, SafeGreen) else null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (isCurrentAct) {
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = SafeGreen,
                                        modifier = Modifier.padding(end = 4.dp)
                                    ) {
                                        Text(
                                            text = if (isBengali) "চলমান" else "NOW",
                                            fontSize = 9.sp,
                                            color = Color.White,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                        )
                                    }
                                }
                                Text(
                                    text = actName,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextPrimary
                                )
                            }
                            Text(
                                text = "${act.timeSlot ?: "সময় নির্ধারিত নেই"} • ${act.targetClass ?: "সকল শ্রেণি"} • ${act.intensity ?: "MODERATE"}",
                                fontSize = 10.sp,
                                color = TextSecondary
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = actStatusColor.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = act.decision ?: "PROCEED",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = actStatusColor,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
