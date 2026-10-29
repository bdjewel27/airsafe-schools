package com.airsafe.schools

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.DecisionCardContent
import com.airsafe.schools.ui.theme.AirSafeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Compose Test: Verifies that the authoritative Decision is the FIRST prominent text
 * inside the Decision Card, above any metrics, reasons, or schedules.
 */
@RunWith(AndroidJUnit4::class)
class DecisionCardHierarchyComposeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun primaryDecisionIsFirstProminentTextInCard_Bengali() {
        val testResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            schoolName = "ঢাকা মডেল স্কুল",
            status = "RED",
            decision = "MOVE_INDOORS",
            heatIndexC = 39.5,
            aqi = 175,
            primaryReason = "AQI ১৭৫ — অস্বাস্থ্যকর বায়ুমান",
            currentActivityBn = "শারীরিক শিক্ষা",
            nextActivityBn = "প্রাত্যহিক সমাবেশ"
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

        // 1. Assert that the tagged primary decision text exists and is displayed
        val decisionNode = composeTestRule.onNodeWithTag("primary_decision_text", useUnmergedTree = true)
        decisionNode.assertExists()
        decisionNode.assertTextEquals("ভেতরে নিন")

        // 2. Fetch all text nodes in the hierarchy and assert that the very first text in the card
        // is the primary decision ("ভেতরে নিন"), proving no school name or activity banner precedes it.
        val textNodes = composeTestRule.onAllNodes(hasText("", substring = true), useUnmergedTree = true)
            .fetchSemanticsNodes()

        assertTrue("Should have rendered text nodes", textNodes.isNotEmpty())
        val firstRenderedText = textNodes.first().config[SemanticsProperties.Text].first().text
        assertEquals("First text inside DecisionCard must be the primary decision", "ভেতরে নিন", firstRenderedText)
    }

    @Test
    fun primaryDecisionIsFirstProminentTextInCard_English() {
        val testResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            schoolName = "Dhaka Model School",
            status = "RED",
            decision = "MOVE_INDOORS",
            heatIndexC = 39.5,
            aqi = 175,
            primaryReasonEn = "AQI 175 — Unhealthy air quality",
            currentActivityEn = "Physical Education",
            nextActivityEn = "Morning Assembly"
        )

        composeTestRule.setContent {
            AirSafeTheme {
                DecisionCardContent(
                    data = testResponse,
                    isBengali = false,
                    onRefresh = {},
                    onMetricClick = {}
                )
            }
        }

        val decisionNode = composeTestRule.onNodeWithTag("primary_decision_text", useUnmergedTree = true)
        decisionNode.assertExists()
        decisionNode.assertTextEquals("MOVE INDOORS")

        val textNodes = composeTestRule.onAllNodes(hasText("", substring = true), useUnmergedTree = true)
            .fetchSemanticsNodes()

        val firstRenderedText = textNodes.first().config[SemanticsProperties.Text].first().text
        assertEquals("First text inside DecisionCard must be the primary decision", "MOVE INDOORS", firstRenderedText)
    }
}
