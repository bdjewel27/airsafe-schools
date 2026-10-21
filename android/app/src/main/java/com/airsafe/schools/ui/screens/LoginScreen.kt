package com.airsafe.schools.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airsafe.schools.ui.theme.*
import com.airsafe.schools.ui.viewmodel.DecisionViewModel

@Composable
fun LoginScreen(
    viewModel: DecisionViewModel,
    modifier: Modifier = Modifier
) {
    val isBengali by viewModel.isBengali.collectAsState()
    val loginError by viewModel.loginError.collectAsState()
    var email by remember { mutableStateOf("fatema.teacher@dms.edu.bd") }
    var password by remember { mutableStateOf("TestStaffPassword2026!") }

    var showServerDialog by remember { mutableStateOf(false) }
    var serverUrlInput by remember { mutableStateOf(viewModel.getCustomBaseUrl()) }

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
            // Language Switch & Server Settings at Top of Login Screen
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        serverUrlInput = viewModel.getCustomBaseUrl()
                        showServerDialog = true
                    },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Server Settings",
                        tint = TextSecondary,
                        modifier = Modifier.size(24.dp)
                    )
                }

                OutlinedButton(
                    onClick = { viewModel.toggleLanguage() },
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = if (isBengali) "English (EN)" else "বাংলা (BN)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = SafeGreen
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

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
                fontSize = 24.sp,
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

            Spacer(modifier = Modifier.height(24.dp))

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
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
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

            Spacer(modifier = Modifier.height(16.dp))

            // Quick Demo Credential Autofill (Hard Gate 3: Role is determined strictly by server/token from email, not passed from UI)
            Text(
                text = if (isBengali)
                    "পরীক্ষার জন্য আমন্ত্রিত ডেমো অ্যাকাউন্ট (রোল সার্ভার থেকে নির্ধারিত):"
                else
                    "Invited Demo Credentials (Role strictly determined by server):",
                fontSize = 11.sp,
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
                        password = "TestStaffPassword2026!"
                    },
                    label = {
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "fatema.teacher@...",
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontSize = 12.sp
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
                        password = "TestStaffPassword2026!"
                    },
                    label = {
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "rafiq.principal@...",
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontSize = 12.sp
                            )
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

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

            Spacer(modifier = Modifier.height(14.dp))

            // Notice: Server Base URL Display
            TextButton(
                onClick = {
                    serverUrlInput = viewModel.getCustomBaseUrl()
                    showServerDialog = true
                }
            ) {
                Text(
                    text = "API: ${viewModel.getCustomBaseUrl()}",
                    fontSize = 11.sp,
                    color = TextSecondary,
                    maxLines = 1
                )
            }
        }
    }

    if (showServerDialog) {
        AlertDialog(
            onDismissRequest = { showServerDialog = false },
            title = { Text(if (isBengali) "সার্ভার API কনফিগারেশন" else "Server API Configuration") },
            text = {
                Column {
                    Text(
                        text = if (isBengali)
                            "ফিজিক্যাল ফোনে লোকাল সার্ভার টেস্টের জন্য কম্পিউটারের LAN IP দিন (যেমন http://192.168.31.37:3000/) অথবা AWS গেটওয়ে URL দিন:"
                        else
                            "For physical devices on local Wi-Fi, enter your host LAN IP (e.g. http://192.168.31.37:3000/) or deployed AWS API Gateway URL:",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = serverUrlInput,
                        onValueChange = { serverUrlInput = it },
                        label = { Text(if (isBengali) "সার্ভার Base URL" else "Server Base URL") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.setCustomBaseUrl(serverUrlInput)
                        showServerDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SafeGreen)
                ) {
                    Text(if (isBengali) "সংরক্ষণ" else "Save", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showServerDialog = false }) {
                    Text(if (isBengali) "বাতিল" else "Cancel")
                }
            }
        )
    }
}
