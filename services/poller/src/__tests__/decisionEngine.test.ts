import {
  evaluateHybridDecision,
  DecisionEngineInput,
} from '../decisionEngine';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

describe('A-1: Decision Engine & Nova record_decision Hybrid Evaluation', () => {
  it('1. should construct ConverseCommand with mandatory toolChoice: record_decision', async () => {
    let capturedCommand: any = null;
    const mockClient = {
      send: jest.fn().mockImplementation((command) => {
        capturedCommand = command;
        return Promise.resolve({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'record_decision',
                    input: {
                      decision: 'MODIFY',
                      confidence: 0.88,
                      reasoning: 'Heat index is elevated; hydration and shade required.',
                      recommended_max_minutes: 30,
                    },
                  },
                },
              ],
            },
          },
        });
      }),
    };

    const input: DecisionEngineInput = {
      schoolId: 'dhaka-model-school',
      schoolName: 'Dhaka Model School',
      aqi: 85,
      heatIndexC: 34.5,
      intensity: 'VIGOROUS',
    };

    const result = await evaluateHybridDecision(input, mockClient as any);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    expect(capturedCommand).toBeInstanceOf(ConverseCommand);
    expect(capturedCommand.input.modelId).toBe('amazon.nova-micro-v1:0');
    expect(capturedCommand.input.toolConfig.toolChoice).toEqual({
      tool: { name: 'record_decision' },
    });
    expect(capturedCommand.input.toolConfig.tools[0].toolSpec.name).toBe('record_decision');
    expect(result.decision_source).toBe('HYBRID_MAX_FLOOR_AI');
    expect(result.modelVersion).toBe('amazon.nova-micro-v1:0');
    expect(result.policyVersion).toBeDefined();
  });

  describe('2. Strict max(floor, ai) safety dominance', () => {
    it('Case 2A: Floor dominates when AI recommends less cautious decision (AI=PROCEED, Floor=MODIFY)', async () => {
      // AQI 160 triggers MOVE_INDOORS / MODIFY in policy floor
      const mockClient = {
        send: jest.fn().mockResolvedValue({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'record_decision',
                    input: {
                      decision: 'PROCEED', // Less cautious AI hallucination/relaxation
                      confidence: 0.95,
                      reasoning: 'Conditions seem acceptable.',
                    },
                  },
                },
              ],
            },
          },
        }),
      };

      const input: DecisionEngineInput = {
        aqi: 140, // Floor triggers MODIFY for VIGOROUS
        heatIndexC: 32.0,
        intensity: 'VIGOROUS',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      // Final decision must not relax below floor
      expect(result.floorDecision).toBe('MODIFY');
      expect(result.aiDecision).toBe('PROCEED');
      expect(result.decision).toBe('MODIFY');
      expect(result.reasonCodes).toContain('FLOOR_DOMINATES_AI');
    });

    it('Case 2B: AI tightens decision when AI recommends stricter decision (Floor=MODIFY, AI=MOVE_INDOORS)', async () => {
      const mockClient = {
        send: jest.fn().mockResolvedValue({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'record_decision',
                    input: {
                      decision: 'MOVE_INDOORS', // AI tightens safety beyond floor
                      confidence: 0.92,
                      reasoning: 'Sharp PM2.5 rise and vulnerable student cohort detected.',
                    },
                  },
                },
              ],
            },
          },
        }),
      };

      const input: DecisionEngineInput = {
        aqi: 120, // Floor is MODIFY
        heatIndexC: 32.0,
        intensity: 'VIGOROUS',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      expect(result.floorDecision).toBe('MODIFY');
      expect(result.aiDecision).toBe('MOVE_INDOORS');
      expect(result.decision).toBe('MOVE_INDOORS'); // AI tightened decision wins
      expect(result.reasonCodes).toContain('AI_TIGHTENED_MOVE_INDOORS');
    });
  });

  describe('3. Confidence < 0.6 threshold flagging', () => {
    it('Case 3A: Flags low confidence when confidence < 0.6', async () => {
      const mockClient = {
        send: jest.fn().mockResolvedValue({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'record_decision',
                    input: {
                      decision: 'MODIFY',
                      confidence: 0.45, // < 0.6
                      reasoning: 'Ambiguous regional weather telemetry.',
                    },
                  },
                },
              ],
            },
          },
        }),
      };

      const input: DecisionEngineInput = {
        aqi: 70,
        heatIndexC: 31.0,
        intensity: 'MODERATE',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      expect(result.confidence).toBe(0.45);
      expect(result.flagged_low_confidence).toBe(true);
      expect(result.reasonCodes).toContain('LOW_CONFIDENCE_FLAG');
    });

    it('Case 3B: Does not flag when confidence >= 0.6', async () => {
      const mockClient = {
        send: jest.fn().mockResolvedValue({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'record_decision',
                    input: {
                      decision: 'PROCEED',
                      confidence: 0.85, // >= 0.6
                      reasoning: 'Clear air and mild temperatures.',
                    },
                  },
                },
              ],
            },
          },
        }),
      };

      const input: DecisionEngineInput = {
        aqi: 40,
        heatIndexC: 25.0,
        intensity: 'LIGHT',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      expect(result.confidence).toBe(0.85);
      expect(result.flagged_low_confidence).toBe(false);
      expect(result.reasonCodes).not.toContain('LOW_CONFIDENCE_FLAG');
    });
  });

  describe('4. Model & Policy Version Preservation', () => {
    it('Records model ID and policy version in output object', async () => {
      const mockClient = {
        send: jest.fn().mockResolvedValue({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'record_decision',
                    input: {
                      decision: 'PROCEED_WITH_PRECAUTIONS',
                      confidence: 0.75,
                      reasoning: 'Mild heat index.',
                    },
                  },
                },
              ],
            },
          },
        }),
      };

      const input: DecisionEngineInput = {
        aqi: 60,
        heatIndexC: 30.0,
        intensity: 'LIGHT',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      expect(result.modelVersion).toBe('amazon.nova-micro-v1:0');
      expect(result.policyVersion).toMatch(/^v1\./);
      expect(result.floorDecision).toBeDefined();
    });
  });

  describe('5. Fallback on Bedrock Sydney Quota 0.0 or ThrottlingException', () => {
    it('Gracefully falls back to deterministic policy floor without crashing', async () => {
      const mockClient = {
        send: jest.fn().mockRejectedValue(
          new Error('ThrottlingException: Service quota reached (0.0 tokens/min) for model amazon.nova-micro-v1:0 in region ap-southeast-2')
        ),
      };

      const input: DecisionEngineInput = {
        aqi: 160,
        heatIndexC: 35.0,
        intensity: 'VIGOROUS',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      expect(result.decision_source).toBe('DETERMINISTIC_POLICY_FALLBACK');
      expect(result.decision).toBe('MOVE_INDOORS');
      expect(result.floorDecision).toBe('MOVE_INDOORS');
      expect(result.aiDecision).toBeNull();
      expect(result.confidence).toBeNull();
      expect(result.flagged_low_confidence).toBe(false);
      expect(result.fallbackReason).toContain('ThrottlingException');
      expect(result.modelVersion).toBe('amazon.nova-micro-v1:0');
      expect(result.policyVersion).toBeDefined();
    });
  });

  describe('6. Non-finite Telemetry Fail-Closed Safety', () => {
    it('Fails closed to UNKNOWN if telemetry values are non-finite', async () => {
      const mockClient = {
        send: jest.fn(),
      };

      const input: DecisionEngineInput = {
        aqi: NaN,
        heatIndexC: Infinity,
        intensity: 'MODERATE',
      };

      const result = await evaluateHybridDecision(input, mockClient as any);

      expect(result.decision).toBe('UNKNOWN');
      expect(mockClient.send).not.toHaveBeenCalled();
      expect(result.fallbackReason).toContain('Non-finite telemetry');
    });
  });
});
