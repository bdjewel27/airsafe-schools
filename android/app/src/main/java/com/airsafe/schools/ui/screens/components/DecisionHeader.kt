package com.airsafe.schools.ui.screens.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.data.model.UserRole
import com.airsafe.schools.data.model.UserSession
import com.airsafe.schools.ui.theme.DangerRed
import com.airsafe.schools.ui.theme.TextPrimary
import com.airsafe.schools.ui.theme.TextSecondary

@Composable
fun DecisionHeader(
    userSession: UserSession?,
    isBengali: Boolean,
    onToggleLanguage: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val schoolName = if (isBengali)
        (userSession?.schoolNameBn ?: "ঢাকা মডেল স্কুল")
    else
        (userSession?.schoolNameEn ?: "Dhaka Model School")

    val userName = if (isBengali)
        (userSession?.nameBn ?: "স্কুল স্টাফ")
    else
        (userSession?.nameEn ?: "School Staff")

    val roleLabel = when (userSession?.role) {
        UserRole.COORDINATOR -> if (isBengali) "কোঅর্ডিনেটর" else "Coordinator"
        UserRole.PLATFORM_ADMIN -> if (isBengali) "প্ল্যাটফর্ম অ্যাডমিন" else "Admin"
        else -> if (isBengali) "শিক্ষক" else "Teacher"
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = schoolName,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
            Text(
                text = "$userName • $roleLabel",
                fontSize = 12.sp,
                color = TextSecondary
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(
                onClick = onToggleLanguage,
                contentPadding = PaddingValues(horizontal = 8.dp)
            ) {
                Icon(
                    Icons.Default.Translate,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = if (isBengali) "English" else "বাংলা",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            IconButton(onClick = onLogout) {
                Icon(
                    Icons.AutoMirrored.Filled.ExitToApp,
                    contentDescription = if (isBengali) "লগআউট" else "Logout",
                    tint = DangerRed
                )
            }
        }
    }
}
