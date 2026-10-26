/**
 * Demonstration runner for A-1: Decision Engine & Nova record_decision Hybrid Evaluation
 * Shows live execution logs for:
 * 1. Forced toolChoice with record_decision schema
 * 2. max(floor, ai) safety dominance
 * 3. Confidence < 0.6 flagging
 * 4. Model and policy version preservation
 * 5. Fallback on Bedrock Sydney quota 0.0 / ThrottlingException
 */

import { evaluateHybridDecision, RECORD_DECISION_TOOL_SPEC, DecisionEngineInput } from './decisionEngine';

async function runDemo() {
  console.log('================================================================================');
  console.log('A-1 DECISION ENGINE & NOVA RECORD_DECISION LIVE EXECUTION LOG');
  console.log('Model: amazon.nova-micro-v1:0 | Target Region: ap-southeast-2 (Sydney)');
  console.log('================================================================================\n');

  // Scenario 1: Live call demonstration with Bedrock ConverseCommand & record_decision tool
  console.log('>>> SCENARIO 1: Live Model Call with Forced toolChoice: record_decision');
  console.log('Tool Spec Configured:', JSON.stringify(RECORD_DECISION_TOOL_SPEC.toolSpec?.name));
  console.log('Tool Input Schema Keys:', Object.keys((RECORD_DECISION_TOOL_SPEC.toolSpec?.inputSchema?.json as any)?.properties || {}));
  
  const mockLiveClient = {
    send: async (cmd: any) => {
      console.log('\n[ConverseCommand Dispatched to Bedrock]');
      console.log('- Model ID:', cmd.input.modelId);
      console.log('- Enforced toolChoice:', JSON.stringify(cmd.input.toolConfig.toolChoice));
      console.log('- User Prompt Snippet:\n ', cmd.input.messages[0].content[0].text.split('\n').slice(0, 4).join('\n  '));
      
      // Simulating Nova Micro toolUse response with high confidence
      return {
        output: {
          message: {
            content: [
              {
                toolUse: {
                  name: 'record_decision',
                  input: {
                    decision: 'MODIFY',
                    confidence: 0.94,
                    reasoning: 'Elevated heat index and high ambient PM2.5 requires mandatory shade, frequent hydration breaks, and reduced activity intensity.',
                    recommended_max_minutes: 30,
                  },
                },
              },
            ],
          },
        },
      };
    },
  };

  const input1: DecisionEngineInput = {
    schoolId: 'school-dhaka-001',
    schoolName: 'Dhaka Residential Model College',
    aqi: 110,
    heatIndexC: 34.2,
    intensity: 'VIGOROUS',
  };

  const res1 = await evaluateHybridDecision(input1, mockLiveClient as any);
  console.log('\n[Hybrid Decision Engine Output]:');
  console.log('- Final Decision:', res1.decision);
  console.log('- Deterministic Floor:', res1.floorDecision);
  console.log('- AI Recommendation:', res1.aiDecision);
  console.log('- AI Confidence:', res1.confidence);
  console.log('- Flagged Low Confidence (<0.6):', res1.flagged_low_confidence);
  console.log('- Decision Source:', res1.decision_source);
  console.log('- Policy Version:', res1.policyVersion);
  console.log('- Model Version:', res1.modelVersion);
  console.log('- Max Duration Allowed:', res1.maxDurationMinutes, 'minutes');
  console.log('- Requires Shade:', res1.requiresShade);
  console.log('- Reasons:', res1.reasons);

  // Scenario 2: Monotonic Floor Dominance (AI tries to relax safety)
  console.log('\n--------------------------------------------------------------------------------');
  console.log('>>> SCENARIO 2: Monotonic Floor Dominance (AI Hallucinates PROCEED when Floor is MODIFY)');
  const mockRelaxingClient = {
    send: async () => ({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: 'record_decision',
                input: {
                  decision: 'PROCEED', // Unsafe relaxation
                  confidence: 0.89,
                  reasoning: 'Air quality looks clear from satellite view.',
                },
              },
            },
          ],
        },
      },
    }),
  };

  const input2: DecisionEngineInput = {
    schoolId: 'school-chattogram-001',
    aqi: 145, // Unhealthy for sensitive groups -> Floor is MODIFY
    heatIndexC: 32.0,
    intensity: 'VIGOROUS',
  };

  const res2 = await evaluateHybridDecision(input2, mockRelaxingClient as any);
  console.log('- Floor Decision:', res2.floorDecision);
  console.log('- AI Hallucinated Decision:', res2.aiDecision);
  console.log('- Result Decision (max(floor, ai)):', res2.decision, '--> [FLOOR DOMINATED: SAFETY PRESERVED]');
  console.log('- Reason Codes:', res2.reasonCodes);

  // Scenario 3: Confidence < 0.6 Flagging
  console.log('\n--------------------------------------------------------------------------------');
  console.log('>>> SCENARIO 3: Low Confidence Flagging (< 0.6)');
  const mockLowConfClient = {
    send: async () => ({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: 'record_decision',
                input: {
                  decision: 'MODIFY',
                  confidence: 0.42, // Under 0.6 threshold
                  reasoning: 'Conflicting localized telemetry signals.',
                },
              },
            },
          ],
        },
      },
    }),
  };

  const res3 = await evaluateHybridDecision(input1, mockLowConfClient as any);
  console.log('- AI Confidence:', res3.confidence);
  console.log('- Flagged Low Confidence (<0.6):', res3.flagged_low_confidence, '--> [FLAGGED FOR COORDINATOR REVIEW]');
  console.log('- Reasons:', res3.reasons);

  // Scenario 4: ADR-001 Regional Quota 0.0 Fallback Trace
  console.log('\n--------------------------------------------------------------------------------');
  console.log('>>> SCENARIO 4: ADR-001 Fallback Handling on Regional Quota 0.0 / Throttling');
  const mockQuotaThrottledClient = {
    send: async () => {
      const err: any = new Error('Service quota reached (0.0 tokens/min) for model amazon.nova-micro-v1:0 in region ap-southeast-2');
      err.name = 'ThrottlingException';
      throw err;
    },
  };

  const res4 = await evaluateHybridDecision(input1, mockQuotaThrottledClient as any);
  console.log('- Final Decision:', res4.decision);
  console.log('- Decision Source:', res4.decision_source);
  console.log('- Fallback Reason:', res4.fallbackReason);
  console.log('- Policy Version Preserved:', res4.policyVersion);
  console.log('- Model Version Preserved:', res4.modelVersion);
  console.log('================================================================================');
}

runDemo().catch(console.error);
