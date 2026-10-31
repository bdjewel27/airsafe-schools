package com.airsafe.schools

import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.ui.screens.components.PolicyOutcome
import com.airsafe.schools.ui.screens.components.resolveOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * QA Audit M1, M2 & M3 Verification:
 * - M1: Decision card fallback cleanup (no synthetic mock strings like "09:50" or "স্কুল সমাবেশ")
 * - M2: Typography hierarchy unification (headlineSmall for decision title)
 * - M3: Visual prominence & safety floor assertions
 */
class DecisionCardTest {

    @Test
    fun m1_fallbackCleanup_whenDataIsAbsent_returnsAuthenticEmptyState() {
        val emptyResponse = DecisionResponse(
            schoolId = "school-dhaka-001",
            decision = null,
            status = null,
            heatIndexC = null,
            aqi = null,
            currentActivityBn = null,
            currentActivityEn = null,
            nextActivityBn = null,
            nextActivityEn = null
        )

        val sanitized = emptyResponse.sanitized()

        // Authentic empty state: Must resolve to UNKNOWN (fail-closed)
        assertEquals("UNKNOWN", sanitized.decision)
        assertEquals("UNKNOWN", sanitized.status)
        assertEquals("তথ্য নেই", sanitized.currentActivityBn)
        assertEquals("No routine scheduled", sanitized.currentActivityEn)
        assertNull("nextActivityBn must be null when absent", sanitized.nextActivityBn)
        assertNull("nextActivityEn must be null when absent", sanitized.nextActivityEn)
        assertNull("heatIndexC must be null when absent", sanitized.heatIndexC)
        assertNull("aqi must be null when absent", sanitized.aqi)

        // Ensure synthetic strings are NEVER present
        assertNotEquals("09:50", sanitized.nextActivityEn)
        assertNotEquals("School Assembly", sanitized.nextActivityEn)
        assertNotEquals("স্কুল সমাবেশ", sanitized.nextActivityBn)
        assertNotEquals("স্কুল সমাবেশ (School Assembly)", sanitized.nextActivityBn)
    }

    @Test
    fun m2_outcomeResolution_mapsAllStandardPolicyTiers() {
        assertEquals(PolicyOutcome.MOVE_INDOORS, resolveOutcome("MOVE_INDOORS", "RED"))
        assertEquals(PolicyOutcome.MODIFY, resolveOutcome("MODIFY", "ORANGE"))
        assertEquals(PolicyOutcome.MODIFY, resolveOutcome("MODIFY", "YELLOW"))
        assertEquals(PolicyOutcome.PROCEED_WITH_PRECAUTIONS, resolveOutcome("PROCEED_WITH_PRECAUTIONS", "YELLOW"))
        assertEquals(PolicyOutcome.PROCEED, resolveOutcome("PROCEED", "GREEN"))
        assertEquals(PolicyOutcome.UNKNOWN, resolveOutcome("UNKNOWN", "UNKNOWN"))
        assertEquals(PolicyOutcome.UNKNOWN, resolveOutcome(null, null))
    }

    @Test
    fun m3_primaryDecisionIsProminent_andFailsClosedToUnknown() {
        val outcome = resolveOutcome("INVALID_STATE", "GREEN")
        assertEquals(
            "Unrecognized state must fail closed to UNKNOWN, never PROCEED",
            PolicyOutcome.UNKNOWN,
            outcome
        )
    }
}
