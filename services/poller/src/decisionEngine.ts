/**
 * Decision Engine with Amazon Nova Micro integration
 * Implements A-1:
 * - Uses @aws-sdk/client-bedrock-runtime ConverseCommand
 * - Enforces toolChoice: { tool: { name: 'record_decision' } }
 * - Applies strict max(floor, ai) safety dominance
 * - Flags confidence < 0.6 (flagged_low_confidence: true)
 * - Captures model version and policy version
 * - Provides safe fallback to deterministic policy floor on Bedrock quota 0.0 / error
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  Tool,
} from '@aws-sdk/client-bedrock-runtime';
import {
  ActivityIntensity,
  PolicyDecision,
  evaluatePolicy,
  DECISION_SEVERITY_ORDER,
  DecisionEvaluationResult,
} from './policy';

export interface DecisionEngineInput {
  schoolId?: string;
  schoolName?: string;
  aqi: number;
  heatIndexC: number;
  intensity: ActivityIntensity;
  isModeled?: boolean;
  isStale?: boolean;
  hasRespiratoryCondition?: boolean;
  evaluationDate?: Date | string | number;
}

export interface HybridDecisionResult extends DecisionEvaluationResult {
  floorDecision: PolicyDecision;
  aiDecision: PolicyDecision | null;
  confidence: number | null;
  flagged_low_confidence: boolean;
  decision_source: 'HYBRID_MAX_FLOOR_AI' | 'DETERMINISTIC_POLICY_FALLBACK';
  modelVersion: string;
  policyVersion: string;
  aiReasoning?: string;
  fallbackReason?: string;
  rawToolCall?: any;
}

export const RECORD_DECISION_TOOL_SPEC: Tool = {
  toolSpec: {
    name: 'record_decision',
    description:
      'Record an outdoor activity safety decision with confidence score, reasoning, and duration limits grounded in environmental telemetry and school policy.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          decision: {
            type: 'string',
            enum: ['PROCEED', 'PROCEED_WITH_PRECAUTIONS', 'MODIFY', 'MOVE_INDOORS'],
            description: 'The evaluated activity safety decision.',
          },
          confidence: {
            type: 'number',
            minimum: 0.0,
            maximum: 1.0,
            description: 'Confidence level of the recommendation between 0.0 and 1.0.',
          },
          reasoning: {
            type: 'string',
            description: 'Clear factual justification referencing heat index, AQI, and student safety.',
          },
          recommended_max_minutes: {
            type: 'number',
            description: 'Recommended maximum outdoor duration in minutes, if applicable.',
          },
        },
        required: ['decision', 'confidence', 'reasoning'],
      },
    },
  },
};

const DEFAULT_REGION = process.env.PROJECT_REGION || 'ap-southeast-2';
const DEFAULT_MODEL_ID = process.env.BEDROCK_DECISION_MODEL_ID || 'amazon.nova-micro-v1:0';

let defaultBedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!defaultBedrockClient) {
    defaultBedrockClient = new BedrockRuntimeClient({ region: DEFAULT_REGION });
  }
  return defaultBedrockClient;
}

/**
 * Builds the prompt for Amazon Nova to evaluate environmental safety.
 */
export function buildDecisionPrompt(input: DecisionEngineInput, floor: DecisionEvaluationResult): string {
  return [
    `You are the Outdoor Activity Safety Evaluation Engine for schools.`,
    `School: ${input.schoolName || input.schoolId || 'Primary Campus'}`,
    `Current Telemetry:`,
    `- Air Quality Index (AQI): ${input.aqi} (US EPA PM2.5 calculation)`,
    `- Heat Index: ${input.heatIndexC}°C`,
    `- Planned Activity Intensity: ${input.intensity}`,
    `- Data Modeled: ${Boolean(input.isModeled)}`,
    `- Data Stale (>90m): ${Boolean(input.isStale)}`,
    `- Respiratory Symptoms Present: ${Boolean(input.hasRespiratoryCondition)}`,
    `Policy v${floor.policyVersion} Baseline Floor Decision: ${floor.decision}`,
    `You MUST invoke the "record_decision" tool with your evaluation.`,
    `Safety Rule: You cannot be less cautious than student safety requirements.`,
  ].join('\n');
}

/**
 * Evaluates outdoor activity safety using a hybrid of deterministic policy floor and Bedrock Nova decision.
 * Strict monotonic rule: final decision = max(floor, ai).
 * If confidence < 0.6, flagged_low_confidence is set to true.
 * If Bedrock fails (e.g. Quota 0.0, timeout, network error), gracefully falls back to deterministic floor.
 */
export async function evaluateHybridDecision(
  input: DecisionEngineInput,
  clientOverride?: BedrockRuntimeClient
): Promise<HybridDecisionResult> {
  const modelId = DEFAULT_MODEL_ID;

  // 1. Calculate deterministic policy floor (monotonic ground truth)
  const floorResult = evaluatePolicy(
    input.aqi,
    input.heatIndexC,
    input.intensity,
    input.isModeled,
    input.isStale,
    input.hasRespiratoryCondition,
    input.evaluationDate
  );

  // If input telemetry was invalid/non-finite, policy returns UNKNOWN fail-closed immediately
  if (floorResult.decision === 'UNKNOWN') {
    return {
      ...floorResult,
      floorDecision: 'UNKNOWN',
      aiDecision: null,
      confidence: null,
      flagged_low_confidence: false,
      decision_source: 'DETERMINISTIC_POLICY_FALLBACK',
      modelVersion: modelId,
      policyVersion: floorResult.policyVersion,
      fallbackReason: 'Non-finite telemetry input: fail-closed to UNKNOWN',
    };
  }

  const client = clientOverride || getBedrockClient();
  const promptText = buildDecisionPrompt(input, floorResult);

  try {
    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: promptText }],
        },
      ],
      toolConfig: {
        tools: [RECORD_DECISION_TOOL_SPEC],
        toolChoice: {
          tool: {
            name: 'record_decision',
          },
        },
      },
      inferenceConfig: {
        maxTokens: 512,
        temperature: 0.1,
      },
    });

    const response = await client.send(command);

    // Parse tool use output
    const contentBlocks = response.output?.message?.content || [];
    const toolUseBlock = contentBlocks.find((block) => (block as any).toolUse?.name === 'record_decision') as any;

    if (!toolUseBlock || !toolUseBlock.toolUse) {
      throw new Error('Bedrock response did not contain required record_decision tool use call');
    }

    const toolInput =
      typeof toolUseBlock.toolUse.input === 'string'
        ? JSON.parse(toolUseBlock.toolUse.input)
        : toolUseBlock.toolUse.input;

    const rawDecision = String(toolInput?.decision || '').toUpperCase() as PolicyDecision;
    const aiDecision: PolicyDecision = ['PROCEED', 'PROCEED_WITH_PRECAUTIONS', 'MODIFY', 'MOVE_INDOORS'].includes(
      rawDecision
    )
      ? rawDecision
      : floorResult.decision;

    const confidence =
      typeof toolInput?.confidence === 'number' && Number.isFinite(toolInput.confidence)
        ? Math.max(0.0, Math.min(1.0, toolInput.confidence))
        : 0.5;

    const aiReasoning = String(toolInput?.reasoning || 'AI decision recorded');
    const recommendedMaxMinutes =
      typeof toolInput?.recommended_max_minutes === 'number'
        ? toolInput.recommended_max_minutes
        : undefined;

    // Strict monotonicity: max(floor, ai)
    const floorRank = DECISION_SEVERITY_ORDER[floorResult.decision] ?? 1;
    const aiRank = DECISION_SEVERITY_ORDER[aiDecision] ?? 1;

    let finalDecision: PolicyDecision;
    const finalReasons = [...floorResult.reasons];
    const finalReasonCodes = [...floorResult.reasonCodes];

    if (aiRank >= floorRank) {
      finalDecision = aiDecision;
      if (aiRank > floorRank) {
        finalReasons.push(`AI Nova recommendation tightened decision to ${aiDecision}: ${aiReasoning}`);
        finalReasonCodes.push(`AI_TIGHTENED_${aiDecision}`);
      }
    } else {
      // Floor dominates: AI cannot relax policy floor!
      finalDecision = floorResult.decision;
      finalReasons.push(`Deterministic floor ${floorResult.decision} dominates AI suggestion (${aiDecision})`);
      finalReasonCodes.push(`FLOOR_DOMINATES_AI`);
    }

    // Flag low confidence if confidence < 0.6
    const flaggedLowConfidence = confidence < 0.6;
    if (flaggedLowConfidence) {
      finalReasons.push(`Decision flagged: AI confidence (${confidence.toFixed(2)}) is below 0.6 threshold`);
      finalReasonCodes.push('LOW_CONFIDENCE_FLAG');
    }

    const durationMinutes =
      recommendedMaxMinutes !== undefined && floorResult.maxDurationMinutes !== undefined
        ? Math.min(recommendedMaxMinutes, floorResult.maxDurationMinutes)
        : floorResult.maxDurationMinutes ?? recommendedMaxMinutes;

    return {
      decision: finalDecision,
      aqiDecision: floorResult.aqiDecision,
      heatDecision: floorResult.heatDecision,
      reasons: finalReasons,
      reasonCodes: finalReasonCodes,
      maxDurationMinutes: durationMinutes,
      requiresShade: floorResult.requiresShade || finalDecision === 'MODIFY',
      isStale: Boolean(input.isStale),
      isModeled: Boolean(input.isModeled),
      hasRespiratoryCondition: Boolean(input.hasRespiratoryCondition),
      floorDecision: floorResult.decision,
      aiDecision,
      confidence,
      flagged_low_confidence: flaggedLowConfidence,
      decision_source: 'HYBRID_MAX_FLOOR_AI',
      modelVersion: modelId,
      policyVersion: floorResult.policyVersion,
      aiReasoning,
      rawToolCall: toolUseBlock.toolUse,
    };
  } catch (err: any) {
    // Fallback: When Bedrock fails (e.g. Quota 0.0 in Sydney ap-southeast-2, throttling, network down)
    console.warn(`[DecisionEngine] Bedrock invocation fallback: ${err?.name || 'Error'} - ${err?.message || err}`);
    return {
      ...floorResult,
      floorDecision: floorResult.decision,
      aiDecision: null,
      confidence: null,
      flagged_low_confidence: false,
      decision_source: 'DETERMINISTIC_POLICY_FALLBACK',
      modelVersion: modelId,
      policyVersion: floorResult.policyVersion,
      fallbackReason: err?.message || String(err),
    };
  }
}
