package com.airsafe.schools

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.airsafe.schools.data.model.ActivityScheduleItem
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.DecisionCardContent
import com.airsafe.schools.ui.theme.AirSafeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Journey J-1 Compose UI Test:
 * Morning Safety Check (সকালের চেক) in <= 10 seconds & <= 3 taps.
 * Verifies that the decision card presents the authoritative glanceable status,
 * outdoor environmental metrics (Heat Index, AQI), and routine activity.
 */
@RunWith(AndroidJUnit4::class)
class JourneyJ1ComposeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun journeyJ1_morningCheck_rendersGlanceableDecisionAndMetrics() {
        val testResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            schoolName = "Dhaka Model School",
            status = "ORANGE",
            decision = "MODIFY",
            policyFloorDecision = "MODIFY",
            heatIndexC = 34.5,
            aqi = 112,
            pm25Ugm3 = 45.2,
            primaryReason = "হিট ইনডেক্স ৩৪.৫°C এবং AQI ১১২ হওয়ায় বহিরাঙ্গন খেলার সময় কমিয়ে ৩০ মিনিট করা হয়েছে।",
            reasons = listOf(
                "হিট ইনডেক্স ৩২-৩৮°C এর মধ্যে রয়েছে (সতর্কতা)",
                "AQI সংবেদনশীল গোষ্ঠীর জন্য অস্বাস্থ্যকর"
            ),
            maxDurationMinutes = 30,
            requiresShade = true,
            isStale = false,
            isModeled = false,
            currentActivityBn = "সকালের প্রাত্যহিক সমাবেশ",
            currentActivityEn = "Morning Assembly",
            nextActivityBn = "ফুটবল অনুশীলন",
            nextActivityEn = "Football Practice",
            activities = listOf(
                ActivityScheduleItem(
                    id = "act-1",
                    nameBn = "সকালের প্রাত্যহিক সমাবেশ",
                    nameEn = "Morning Assembly",
                    decision = "MODIFY",
                    status = "ORANGE",
                    timeSlot = "08:00 - 08:45 AM",
                    targetClass = "Class 5",
                    intensity = "LIGHT",
                    isCurrent = true,
                    order = 1
                ),
                ActivityScheduleItem(
                    id = "act-2",
                    nameBn = "ফুটবল অনুশীলন",
                    nameEn = "Football Practice",
                    decision = "MOVE_INDOORS",
                    status = "RED",
                    timeSlot = "09:00 - 09:45 AM",
                    targetClass = "Class 8",
                    intensity = "VIGOROUS",
                    isCurrent = false,
                    order = 2
                )
            )
        )

        composeTestRule.setContent {
            AirSafeTheme {
                DecisionCardContent(
                    data = testResponse,
                    isBengali = true,
                    onRefresh = {},
                    onMetricClick = {}
                )
            }
        }

        // 1. Verify Decision text is present and visible
        composeTestRule.onNodeWithText("কার্যক্রম সীমিত করুন").assertIsDisplayed()

        // 2. Verify Heat Index metric is rendered
        composeTestRule.onNodeWithText("হিট ইনডেক্স: ", substring = true).assertIsDisplayed()

        // 3. Verify AQI metric is rendered
        composeTestRule.onNodeWithText("বায়ুমান সূচক: ", substring = true).assertIsDisplayed()

        // 4. Verify Routine Activity Schedule toggle is displayed and expands on click
        composeTestRule.onNodeWithText("সব দেখুন (রুটিন) ▼").assertIsDisplayed()
        composeTestRule.onNodeWithText("সব দেখুন (রুটিন) ▼").performClick()
        composeTestRule.onNodeWithText("📅 অ্যাক্টিভিটি ও সময়সূচি").assertIsDisplayed()
        composeTestRule.onNodeWithText("সকালের প্রাত্যহিক সমাবেশ").assertIsDisplayed()
        composeTestRule.onNodeWithText("ফুটবল অনুশীলন").assertIsDisplayed()

        // 5. Verify duration restriction badge for MODIFY policy
        composeTestRule.onNodeWithText("সর্বোচ্চ ৩০ মিনিট").assertIsDisplayed()
        composeTestRule.onNodeWithText("ছায়াযুক্ত স্থান আবশ্যক").assertIsDisplayed()
    }
}
