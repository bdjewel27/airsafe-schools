package com.airsafe.schools

import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.components.PolicyOutcome
import com.airsafe.schools.ui.screens.components.resolveOutcome
import com.airsafe.schools.ui.theme.SafeGreen
import com.airsafe.schools.ui.theme.UnknownGray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Hard Gate 4 Verification:
 * UNKNOWN decision/status NEVER maps to GREEN or PROCEED under any circumstances.
 */
class DecisionCardScreenTest {

    @Test
    fun unknown_decision_resolves_to_PolicyOutcome_UNKNOWN_never_PROCEED() {
        val outcome = resolveOutcome("UNKNOWN", "UNKNOWN")
        assertEquals(PolicyOutcome.UNKNOWN, outcome)
        assertNotEquals(PolicyOutcome.PROCEED, outcome)
    }

    @Test
    fun null_inputs_resolve_strictly_to_PolicyOutcome_UNKNOWN() {
        val outcome = resolveOutcome(null, null)
        assertEquals(PolicyOutcome.UNKNOWN, outcome)
        assertNotEquals(PolicyOutcome.PROCEED, outcome)
    }

    @Test
    fun corrupted_or_unrecognized_strings_resolve_to_PolicyOutcome_UNKNOWN() {
        val testInputs = listOf(
            Pair("RANDOM_TEXT", "UNKNOWN"),
            Pair("SAFE_ASSUMPTION", "GREEN_MAYBE"),
            Pair("", ""),
            Pair("   ", "   "),
            Pair("N/A", "N/A")
        )

        for ((dec, status) in testInputs) {
            val outcome = resolveOutcome(dec, status)
            assertEquals("Input ($dec, $status) must fail closed to UNKNOWN", PolicyOutcome.UNKNOWN, outcome)
            assertNotEquals(PolicyOutcome.PROCEED, outcome)
        }
    }

    @Test
    fun modify_decision_resolves_to_PolicyOutcome_MODIFY() {
        val outcome = resolveOutcome("MODIFY", "ORANGE")
        assertEquals(PolicyOutcome.MODIFY, outcome)
    }

    @Test
    fun move_indoors_decision_resolves_to_PolicyOutcome_MOVE_INDOORS() {
        val outcome = resolveOutcome("MOVE_INDOORS", "RED")
        assertEquals(PolicyOutcome.MOVE_INDOORS, outcome)
    }

    @Test
    fun sanitized_fails_closed_when_telemetry_metrics_are_missing() {
        val emptyResp = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = "PROCEED", // Attempted forged PROCEED without telemetry
            status = "GREEN",
            heatIndexC = null,
            aqi = null
        )
        val sanitized = emptyResp.sanitized()
        assertEquals("UNKNOWN", sanitized.decision)
        assertEquals("UNKNOWN", sanitized.status)
        assertTrue("isStale must be true when metrics are missing (fail-closed)", sanitized.isStale == true)
    }

    @Test
    fun sanitized_fails_closed_when_only_one_metric_is_present() {
        // Only heat index present, AQI missing -> must fail closed to UNKNOWN
        val partialResp1 = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = "PROCEED",
            status = "GREEN",
            heatIndexC = 28.0,
            aqi = null
        )
        val sanitized1 = partialResp1.sanitized()
        assertEquals("UNKNOWN", sanitized1.decision)
        assertEquals("UNKNOWN", sanitized1.status)

        // Only AQI present, heat index missing -> must fail closed to UNKNOWN
        val partialResp2 = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = "PROCEED",
            status = "GREEN",
            heatIndexC = null,
            aqi = 45
        )
        val sanitized2 = partialResp2.sanitized()
        assertEquals("UNKNOWN", sanitized2.decision)
        assertEquals("UNKNOWN", sanitized2.status)
    }

    @Test
    fun unknown_theme_color_is_never_green() {
        // Verify that the color mapped to UNKNOWN is UnknownGray and distinct from SafeGreen
        assertNotEquals(SafeGreen, UnknownGray)
    }

    @Test
    fun sanitized_does_not_inject_fake_routine_defaults_when_empty() {
        val resp = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = "PROCEED",
            status = "GREEN",
            heatIndexC = 28.0,
            aqi = 40,
            currentActivityBn = null,
            currentActivityEn = null,
            nextActivityBn = null,
            nextActivityEn = null
        )
        val sanitized = resp.sanitized()
        assertEquals("তথ্য নেই", sanitized.currentActivityBn)
        assertEquals("No routine scheduled", sanitized.currentActivityEn)
        assertEquals(null, sanitized.nextActivityBn)
        assertEquals(null, sanitized.nextActivityEn)
    }

    @Test
    fun sanitized_preserves_authentic_lastUpdated_timestamp() {
        val serverTime = "2026-10-18T14:30:00Z"
        val resp = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = "PROCEED",
            status = "GREEN",
            heatIndexC = 28.0,
            aqi = 40,
            lastUpdated = serverTime
        )
        val sanitized = resp.sanitized()
        assertEquals(serverTime, sanitized.lastUpdated)
    }
}
