package com.airsafe.schools

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.DecisionCardContent
import com.airsafe.schools.ui.theme.AirSafeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * QA Audit M3: Compose UI Test asserting that the primary decision text
 * is rendered as the most prominent text node with the largest typography style,
 * and authentic empty state "তথ্য নেই" is displayed when data is absent.
 */
@RunWith(AndroidJUnit4::class)
class DecisionCardTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun primaryDecisionText_isRenderedAsMostProminentNode_Bengali() {
        val testResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            schoolName = "ঢাকা মডেল স্কুল",
            status = "RED",
            decision = "MOVE_INDOORS",
            heatIndexC = 41.0,
            aqi = 185,
            primaryReason = "AQI ১৮৫ — ক্ষতিকর বায়ুমান",
            currentActivityBn = "শারীরিক শিক্ষা",
            nextActivityBn = "ইনডোর অ্যাসেম্বলি"
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

        // 1. Assert that the tagged primary decision text exists and displays the top-level decision
        val decisionNode = composeTestRule.onNodeWithTag("primary_decision_text", useUnmergedTree = true)
        decisionNode.assertExists()
        decisionNode.assertTextEquals("ভেতরে নিন")

        // 2. Fetch all text nodes to assert that the very first rendered text node is the primary decision
        val textNodes = composeTestRule.onAllNodes(hasText("", substring = true), useUnmergedTree = true)
            .fetchSemanticsNodes()

        assertTrue("Should have rendered text nodes", textNodes.isNotEmpty())
        val firstRenderedText = textNodes.first().config[SemanticsProperties.Text].first().text
        assertEquals("Primary decision ('ভেতরে নিন') must be the top-most prominent text node", "ভেতরে নিন", firstRenderedText)
    }

    @Test
    fun primaryDecisionText_isRenderedAsMostProminentNode_English() {
        val testResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            schoolName = "Dhaka Model School",
            status = "ORANGE",
            decision = "MODIFY",
            heatIndexC = 36.0,
            aqi = 120,
            primaryReasonEn = "AQI 120 — Sensitive groups caution",
            currentActivityEn = "Outdoor Play",
            nextActivityEn = null
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
        decisionNode.assertTextEquals("MODIFY ACTIVITIES")

        val textNodes = composeTestRule.onAllNodes(hasText("", substring = true), useUnmergedTree = true)
            .fetchSemanticsNodes()

        val firstRenderedText = textNodes.first().config[SemanticsProperties.Text].first().text
        assertEquals("Primary decision must be the top-most prominent text node", "MODIFY ACTIVITIES", firstRenderedText)
    }

    @Test
    fun decisionCard_whenDataIsAbsent_rendersAuthenticEmptyState_noSyntheticMockStrings() {
        val emptyResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = null,
            status = null,
            heatIndexC = null,
            aqi = null
        )

        composeTestRule.setContent {
            AirSafeTheme {
                DecisionCardContent(
                    data = emptyResponse,
                    isBengali = true,
                    onRefresh = {},
                    onMetricClick = {}
                )
            }
        }

        // Must display authentic "তথ্য নেই"
        val decisionNode = composeTestRule.onNodeWithTag("primary_decision_text", useUnmergedTree = true)
        decisionNode.assertExists()
        decisionNode.assertTextEquals("তথ্য নেই")

        // Must NOT render synthetic mock strings
        composeTestRule.onNodeWithText("09:50", substring = true).assertDoesNotExist()
        composeTestRule.onNodeWithText("স্কুল সমাবেশ (School Assembly)", substring = true).assertDoesNotExist()
    }
}
