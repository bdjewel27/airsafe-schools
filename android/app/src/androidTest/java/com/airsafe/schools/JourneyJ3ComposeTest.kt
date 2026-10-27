package com.airsafe.schools

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.components.ExplanationDialog
import com.airsafe.schools.ui.screens.components.OverrideDialog
import com.airsafe.schools.ui.theme.AirSafeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Journey J-3 Compose UI Test:
 * Deterioration Push Alert & Coordinator Override (F-11 & J-3).
 * Verifies that the emergency deterioration explanation dialog surfaces the warning,
 * and the override dialog enforces the minimum 5-character justification and tighten-only policy.
 */
@RunWith(AndroidJUnit4::class)
class JourneyJ3ComposeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun journeyJ3_deteriorationAlert_rendersCriticalExplanation() {
        val criticalData = DecisionResponse(
            schoolId = "school-dhaka-001",
            schoolName = "ঢাকা মডেল স্কুল",
            status = "RED",
            decision = "MOVE_INDOORS",
            policyFloorDecision = "MOVE_INDOORS",
            heatIndexC = 41.2,
            aqi = 188,
            pm25Ugm3 = 127.5,
            primaryReason = "হিট ইনডেক্স ৪১.২°C ও একিউআই ১৮৮ বিপজ্জনক সীমার উপরে!",
            reasons = listOf(
                "হিট ইনডেক্স ৩৯°C এর বেশি (চরম ঝুঁকি)",
                "বাতাসে PM2.5 কণার মাত্রা বিপজ্জনক"
            ),
            isStale = false,
            isModeled = false
        )

        composeTestRule.setContent {
            AirSafeTheme {
                ExplanationDialog(
                    safeData = criticalData,
                    isBengali = true,
                    onDismiss = {}
                )
            }
        }

        // 1. Verify Alert Dialog title
        composeTestRule.onNodeWithText("🚨 জরুরি এয়ারসেফ ব্যাখ্যা ও সতর্কতা").assertIsDisplayed()

        // 2. Verify Critical Decision is highlighted
        composeTestRule.onNodeWithText("MOVE_INDOORS").assertIsDisplayed()

        // 3. Verify Environmental metrics
        composeTestRule.onNodeWithText("হিট ইনডেক্স: ৪১.২°C").assertIsDisplayed()
        composeTestRule.onNodeWithText("US AQI: ১৮৮").assertIsDisplayed()

        // 4. Verify Dismiss button exists
        composeTestRule.onNodeWithText("ঠিক আছে").assertIsDisplayed()
    }

    @Test
    fun journeyJ3_coordinatorOverride_enforcesJustificationRequirement() {
        var appliedDecision: String? = null
        var appliedReason: String? = null

        composeTestRule.setContent {
            AirSafeTheme {
                OverrideDialog(
                    currentDec = "MODIFY",
                    isBengali = true,
                    onApplyOverride = { dec, reason ->
                        appliedDecision = dec
                        appliedReason = reason
                    },
                    onDismiss = {}
                )
            }
        }

        // 1. Verify Dialog Title
        composeTestRule.onNodeWithText("বাধ্যতামূলক কারণসহ ওভাররাইড").assertIsDisplayed()

        // 2. Verify Target Decision Options (Tighten-only)
        composeTestRule.onNodeWithText("MOVE_INDOORS").assertIsDisplayed()

        // 3. Attempt to submit with empty reason -> validation error
        composeTestRule.onNodeWithText("ওভাররাইড নিশ্চিত করুন").performClick()
        composeTestRule.onNodeWithText("কারণ কমপক্ষে ৫ অক্ষরের হতে হবে").assertIsDisplayed()

        // 4. Enter valid reason and apply
        composeTestRule.onNodeWithText("ওভাররাইডের কারণ").performTextInput("বৃষ্টির কারণে মাঠ পিচ্ছিল থাকায় ক্লাস রুমে স্থানান্তর")
        composeTestRule.onNodeWithText("ওভাররাইড নিশ্চিত করুন").performClick()

        // 5. Assert override was dispatched
        assert(appliedDecision != null)
        assert(appliedReason == "বৃষ্টির কারণে মাঠ পিচ্ছিল থাকায় ক্লাস রুমে স্থানান্তর")
    }
}
