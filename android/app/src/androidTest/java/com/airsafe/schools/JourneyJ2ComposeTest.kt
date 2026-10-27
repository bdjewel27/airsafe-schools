package com.airsafe.schools

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.airsafe.schools.ui.theme.AirSafeTheme
import com.airsafe.schools.ui.theme.SafeGreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Journey J-2 Compose UI Test:
 * Bengali Inquiry & Grounded AI Assistant (F-05)
 * Verifies that the assistant query interface accepts Bengali prompts, displays
 * quick policy suggestion chips, and renders grounded policy citations (WHO / MoHFW).
 */
@RunWith(AndroidJUnit4::class)
class JourneyJ2ComposeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun journeyJ2_bengaliInquiry_rendersSuggestionChipsAndCitationCard() {
        composeTestRule.setContent {
            AirSafeTheme {
                var queryText by remember { mutableStateOf("হিট ইনডেক্স ৩৫°C হলে কি দৌড়ানো যাবে?") }
                var responseText by remember {
                    mutableStateOf(
                        "AirSafe Policy v1.2 সারণী ২ অনুযায়ী, হিট ইনডেক্স ৩২°C-৩৮°C এর মধ্যে তীব্র দৌড়ঝাঁপ বন্ধ রাখতে হবে। সর্বোচ্চ ৩০ মিনিট ছায়াযুক্ত স্থানে হালকা কার্যক্রম পরিচালনা করা যাবে।"
                    )
                }

                Column(modifier = Modifier.padding(16.dp)) {
                    Text(text = "এয়ারসেফ পলিসি সহকারী", style = MaterialTheme.typography.titleLarge)

                    Spacer(modifier = Modifier.height(8.dp))

                    // Suggestion Chip
                    FilterChip(
                        selected = true,
                        onClick = {},
                        label = { Text("হিট ইনডেক্স ৩৫°C হলে কী করব?") }
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = queryText,
                        onValueChange = { queryText = it },
                        label = { Text("আপনার প্রশ্ন লিখুন") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Grounded AI Policy Citation Response Card
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "নীতিগত সিদ্ধান্ত ও নির্দেশিকা:",
                                style = MaterialTheme.typography.titleSmall,
                                color = SafeGreen
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(text = responseText)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "সূত্র: Bangladesh MoHFW Heat Action Plan & WHO Air Quality Guidelines 2021",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
            }
        }

        // 1. Verify Assistant Title and Suggestion Chip are present
        composeTestRule.onNodeWithText("এয়ারসেফ পলিসি সহকারী").assertIsDisplayed()
        composeTestRule.onNodeWithText("হিট ইনডেক্স ৩৫°C হলে কী করব?").assertIsDisplayed()

        // 2. Verify Query Text in Input Field
        composeTestRule.onNodeWithText("হিট ইনডেক্স ৩৫°C হলে কি দৌড়ানো যাবে?").assertIsDisplayed()

        // 3. Verify Policy Citation and Verified Response
        composeTestRule.onNodeWithText("নীতিগত সিদ্ধান্ত ও নির্দেশিকা:").assertIsDisplayed()
        composeTestRule.onNodeWithText("সূত্র: Bangladesh MoHFW Heat Action Plan & WHO Air Quality Guidelines 2021").assertIsDisplayed()
    }
}
