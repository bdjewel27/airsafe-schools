package com.airsafe.schools

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.airsafe.schools.data.model.UserRole
import com.airsafe.schools.ui.screens.*
import com.airsafe.schools.ui.theme.AirSafeTheme
import com.airsafe.schools.ui.theme.SafeGreen
import com.airsafe.schools.ui.viewmodel.AppTab
import com.airsafe.schools.ui.viewmodel.DecisionViewModel
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val viewModel: DecisionViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Notification Channel for F-02 Danger Alerts
        com.airsafe.schools.data.notification.AirSafeNotificationHelper.createNotificationChannel(this)

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
        }

        handleNotificationIntent(intent)

        setContent {
            val isBengali by viewModel.isBengali.collectAsState()
            val targetLocale = Locale(if (isBengali) "bn" else "en")
            val config = Configuration(resources.configuration).apply {
                setLocale(targetLocale)
            }
            val localizedContext = createConfigurationContext(config)

            CompositionLocalProvider(LocalContext provides localizedContext) {
                AirSafeTheme {
                    val userSession by viewModel.userSession.collectAsState()

                    // F-01 (MUST): If not authenticated, force LoginScreen (Self sign-up disabled)
                    if (userSession == null) {
                        LoginScreen(viewModel = viewModel)
                    } else {
                        MainContainer(viewModel = viewModel)
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val schoolId = viewModel.userSession.value?.schoolId ?: viewModel.selectedSchoolId.value
        viewModel.startForegroundSync(schoolId)
    }

    override fun onPause() {
        super.onPause()
        viewModel.stopForegroundSync()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNotificationIntent(intent)
    }

    private fun handleNotificationIntent(intent: android.content.Intent?) {
        if (intent == null) return
        val showExplanation = intent.getBooleanExtra("SHOW_EXPLANATION", false)
        val targetScreen = intent.getStringExtra("target_screen")
        if (showExplanation || targetScreen == "EXPLANATION") {
            viewModel.triggerExplanationFromNotification()
        }
    }
}

@Composable
fun MainContainer(viewModel: DecisionViewModel) {
    val currentTab by viewModel.currentTab.collectAsState()
    val isBengali by viewModel.isBengali.collectAsState()
    val userSession by viewModel.userSession.collectAsState()
    val isCoordinator = userSession?.role == UserRole.COORDINATOR

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = currentTab == AppTab.HOME,
                    onClick = { viewModel.setTab(AppTab.HOME) },
                    icon = { Icon(Icons.Default.Home, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_home)) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = SafeGreen)
                )
                NavigationBarItem(
                    selected = currentTab == AppTab.TRENDS,
                    onClick = { viewModel.setTab(AppTab.TRENDS) },
                    icon = { Icon(Icons.AutoMirrored.Filled.ShowChart, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_trends)) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = SafeGreen)
                )
                NavigationBarItem(
                    selected = currentTab == AppTab.ASSISTANT,
                    onClick = { viewModel.setTab(AppTab.ASSISTANT) },
                    icon = { Icon(Icons.Default.SmartToy, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_assistant)) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = SafeGreen)
                )

                // Coordinator-only Tabs (F-12: Staff & F-13: Analytics)
                if (isCoordinator) {
                    NavigationBarItem(
                        selected = currentTab == AppTab.STAFF_MANAGEMENT,
                        onClick = { viewModel.setTab(AppTab.STAFF_MANAGEMENT) },
                        icon = { Icon(Icons.Default.Group, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_staff)) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = SafeGreen)
                    )
                    NavigationBarItem(
                        selected = currentTab == AppTab.ANALYTICS,
                        onClick = { viewModel.setTab(AppTab.ANALYTICS) },
                        icon = { Icon(Icons.Default.DateRange, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_analytics)) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = SafeGreen)
                    )
                }
            }
        }
    ) { innerPadding ->
        when (currentTab) {
            AppTab.HOME -> DecisionCardScreen(
                viewModel = viewModel,
                modifier = Modifier.padding(innerPadding)
            )
            AppTab.TRENDS -> TrendsScreen(
                viewModel = viewModel,
                modifier = Modifier.padding(innerPadding)
            )
            AppTab.ASSISTANT -> AssistantScreen(
                viewModel = viewModel,
                modifier = Modifier.padding(innerPadding)
            )
            AppTab.STAFF_MANAGEMENT -> StaffManagementScreen(
                viewModel = viewModel,
                modifier = Modifier.padding(innerPadding)
            )
            AppTab.ANALYTICS -> SchoolAnalyticsScreen(
                viewModel = viewModel,
                modifier = Modifier.padding(innerPadding)
            )
        }
    }
}
