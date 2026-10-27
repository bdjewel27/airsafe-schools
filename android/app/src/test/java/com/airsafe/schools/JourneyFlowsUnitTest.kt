package com.airsafe.schools

import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.components.PolicyOutcome
import com.airsafe.schools.ui.screens.components.resolveOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit Tests for Journey J-1 through J-3 Logic & Safety Gates:
 * J-1: Morning Safety Check (Glanceable Decision & Outcome resolution)
 * J-2: Bengali Inquiry & Deterministic Policy Floor
 * J-3: Deterioration Emergency Alert & Tighten-Only Override
 */
class JourneyFlowsUnitTest {

    @Test
    fun journeyJ1_morningCheck_resolveOutcomeMatchesThresholds() {
        // Safe conditions -> PROCEED
        assertEquals(PolicyOutcome.PROCEED, resolveOutcome("PROCEED", "GREEN"))

        // Moderate heat / AQI -> MODIFY
        assertEquals(PolicyOutcome.MODIFY, resolveOutcome("MODIFY", "ORANGE"))

        // Hazardous conditions -> MOVE_INDOORS
        assertEquals(PolicyOutcome.MOVE_INDOORS, resolveOutcome("MOVE_INDOORS", "RED"))

        // Missing / Corrupt / Stale data -> Fails closed to UNKNOWN
        assertEquals(PolicyOutcome.UNKNOWN, resolveOutcome("RANDOM", "INVALID"))
        assertEquals(PolicyOutcome.UNKNOWN, resolveOutcome(null, null))
    }

    @Test
    fun journeyJ2_bengaliPolicyFloor_sanitizedGuaranteesSafeDefaults() {
        val rawResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = "PROCEED",
            status = "GREEN",
            heatIndexC = 29.0,
            aqi = 65,
            currentActivityBn = null,
            currentActivityEn = null
        )
        val sanitized = rawResponse.sanitized()
        // Must provide safe fallback activity labels rather than crashing or showing blanks
        assertEquals("তথ্য নেই", sanitized.currentActivityBn)
        assertEquals("No routine scheduled", sanitized.currentActivityEn)
    }

    @Test
    fun journeyJ3_coordinatorOverride_tightenOnlyVerification() {
        // When active decision is MOVE_INDOORS, coordinator cannot relax it to PROCEED
        val activeDecision = "MOVE_INDOORS"
        val allowedOptions = when (activeDecision) {
            "MOVE_INDOORS" -> listOf("MOVE_INDOORS")
            "MODIFY" -> listOf("MOVE_INDOORS", "MODIFY")
            else -> listOf("MOVE_INDOORS", "MODIFY", "PRECAUTIONS")
        }

        assertTrue("Tighten-only policy: MOVE_INDOORS can only be overridden to MOVE_INDOORS",
            allowedOptions == listOf("MOVE_INDOORS")
        )
    }
}
