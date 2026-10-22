package com.airsafe.schools.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

/**
 * F-01 & S-2: Invite-only Authentication Portal.
 * Self sign-up disabled. Role and School ID are strictly determined by server claims.
 */
@Composable
fun LoginScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val isBengali by viewModel.isBengali.collectAsState()
    val loginError by viewModel.loginError.collectAsState()
    var email by remember { mutableStateOf("fatema.teacher@dms.edu.bd") }
    var password by remember { mutableStateOf("[REDACTED_PASSWORD]") }
    var passwordVisible by remember { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Language Switch at Top of Login Screen (Minimal header)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                OutlinedButton(
                    onClick = { viewModel.toggleLanguage() },
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = if (isBengali) "English" else "বাংলা",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = SafeGreen
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // App Branding Icon
            Icon(
                imageVector = Icons.Default.School,
                contentDescription = null,
                tint = SafeGreen,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "AirSafe Schools",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = SafeGreen
            )

            Text(
                text = if (isBengali)
                    "শুধু আমন্ত্রিত স্কুল স্টাফদের জন্য নিরাপদ সাইন-ইন পোর্টাল"
                else
                    "Invite-only Staff Authentication Portal",
                fontSize = 13.sp,
                color = TextSecondary,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(28.dp))

            // Email Input
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text(if (isBengali) "স্কুল ইমেইল" else "School Email") },
                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Password Input
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text(if (isBengali) "পাসওয়ার্ড" else "Password") },
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                trailingIcon = {
                    val image = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff
                    val desc = if (passwordVisible) "পাসওয়ার্ড লুকান" else "পাসওয়ার্ড দেখুন"
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(imageVector = image, contentDescription = desc)
                    }
                },
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Text(
                text = if (isBengali) "🔑 টেস্ট পাসওয়ার্ড: [REDACTED_PASSWORD]" else "🔑 Test Password: [REDACTED_PASSWORD]",
                fontSize = 11.sp,
                color = TextSecondary,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, start = 4.dp)
            )

            if (!loginError.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = loginError!!,
                    color = DangerRed,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Demo Credential Quick-Select (Hard Gate 3: Role is determined strictly by server from email)
            Text(
                text = if (isBengali)
                    "আমন্ত্রিত স্টাফ অ্যাকাউন্ট নির্বাচন করুন:"
                else
                    "Select Invited Staff Demo Account:",
                fontSize = 12.sp,
                color = TextSecondary,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                FilterChip(
                    selected = email.equals("fatema.teacher@dms.edu.bd", ignoreCase = true),
                    onClick = {
                        email = "fatema.teacher@dms.edu.bd"
                        password = "[REDACTED_PASSWORD]"
                    },
                    label = {
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = if (isBengali) "শিক্ষক (ফাতিমা)" else "Teacher (Fatema)",
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                )

                FilterChip(
                    selected = email.equals("rafiq.principal@dms.edu.bd", ignoreCase = true),
                    onClick = {
                        email = "rafiq.principal@dms.edu.bd"
                        password = "[REDACTED_PASSWORD]"
                    },
                    label = {
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = if (isBengali) "কোঅর্ডিনেটর (রফিক)" else "Coordinator (Rafiq)",
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Sign In Button
            Button(
                onClick = { viewModel.authenticateStaff(email, password) },
                colors = ButtonDefaults.buttonColors(containerColor = SafeGreen),
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 52.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = if (isBengali) "লগইন করুন" else "Sign In",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Notice: Self sign-up disabled per F-01 and S-2
            Text(
                text = if (isBengali)
                    "⚠️ নতুন অ্যাকাউন্ট খোলার অনুমতি নেই (Self sign-up disabled)। আপনার রোল ও স্কুল আইডি সার্ভার দ্বারা নিয়ন্ত্রিত (S-2)।"
                else
                    "⚠️ Self sign-up is disabled. Your role and school_id are strictly controlled by server token claims (S-2).",
                fontSize = 11.sp,
                color = TextSecondary,
                lineHeight = 15.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
