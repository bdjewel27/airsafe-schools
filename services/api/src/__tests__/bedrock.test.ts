process.env.API_JWT_SECRET = 'test-suite-secure-jwt-secret-for-jest-only-32bytes';
process.env.MCP_JWT_SECRET = 'test-suite-secure-mcp-secret-for-jest-only-32bytes';

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  BEDROCK_TOOL_CONFIG,
  buildAssistantSystemPrompt,
  routeUserQuery,
  generateFollowUpSuggestions,
  buildContextualAnswer,
  executeBedrockAssistant,
  executeBedrockStreamAssistantWithMcp,
} from '../bedrock';
import { McpClient } from '../mcpClient';
import { mintMcpTokenForChat, handler, createSignedJwt, docClient } from '../index';

describe('F-05 / A-3: Bedrock ConverseStream + MCP Tool Calling & Query Routing', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('Bedrock tool configuration defines valid get_school_decision, get_sensor_readings and get_outdoor_policy tool specs', () => {
    expect(BEDROCK_TOOL_CONFIG.tools).toHaveLength(3);

    const decisionTool = BEDROCK_TOOL_CONFIG.tools.find((t) => t.toolSpec.name === 'get_school_decision');
    expect(decisionTool).toBeDefined();
    expect(decisionTool?.toolSpec.inputSchema.json.properties).toEqual({});

    const policyTool = BEDROCK_TOOL_CONFIG.tools.find((t) => t.toolSpec.name === 'get_outdoor_policy');
    expect(policyTool).toBeDefined();
  });

  test('Query Router correctly identifies field inquiry and routes to decision tool', () => {
    const route1 = routeUserQuery('আজকে মাঠে খেলাধুলা করা কি নিরাপদ?');
    expect(route1.needsDecisionTool).toBe(true);

    const route2 = routeUserQuery('Can students play outside during current PE class?');
    expect(route2.needsDecisionTool).toBe(true);
    expect(route2.detectedTopic).toBe('ROUTINE');
  });

  test('Query Router identifies policy guideline inquiry and routes to policy tool', () => {
    const route = routeUserQuery('হিট ইনডেক্সের জন্য এয়ারসেফ স্কুলের নীতিমালা ও নিয়ম কী?');
    expect(route.needsPolicyTool).toBe(true);
    expect(route.detectedTopic).toBe('HEAT');
  });

  test('buildAssistantSystemPrompt injects school identity and Policy v1.2 citation mandates', () => {
    const promptBn = buildAssistantSystemPrompt('ঢাকা মডেল স্কুল', 'Dhaka Model School', true);
    expect(promptBn).toContain('ঢাকা মডেল স্কুল');
    expect(promptBn).toContain('Model School Outdoor Activity Policy v1.2');

    const promptEn = buildAssistantSystemPrompt('ঢাকা মডেল স্কুল', 'Dhaka Model School', false);
    expect(promptEn).toContain('Dhaka Model School');
    expect(promptEn).toContain('Policy v1.2');
  });

  test('generateFollowUpSuggestions returns contextual follow-up questions for topics', () => {
    const heatFollowUpsBn = generateFollowUpSuggestions('HEAT', 'MODIFY', true);
    expect(heatFollowUpsBn.length).toBeGreaterThanOrEqual(2);
    expect(heatFollowUpsBn[0]).toContain('হিট ইনডেক্স');

    const aqiFollowUpsEn = generateFollowUpSuggestions('AQI', 'MOVE_INDOORS', false);
    expect(aqiFollowUpsEn.length).toBeGreaterThanOrEqual(2);
    expect(aqiFollowUpsEn[0]).toContain('asthma');
  });

  test('buildContextualAnswer produces specific non-template answer addressing query context', () => {
    const answer = buildContextualAnswer({
      query: 'আজকে দুপুরের রোদে ফুটবল ম্যাচ খেলা যাবে কি?',
      schoolNameBn: 'ঢাকা মডেল স্কুল',
      schoolNameEn: 'Dhaka Model School',
      isBengali: true,
      decision: 'MOVE_INDOORS',
      policyFloorDecision: 'MOVE_INDOORS',
      heatIndexC: 40.5,
      aqi: 165,
      activeIntensity: 'vigorous',
      routineNameBn: 'ফুটবল ম্যাচ ড্রিল',
      routineNameEn: 'PE Football Drill',
      nextActivityBn: 'বিজ্ঞান মেলা',
      nextActivityEn: 'Science Fair',
      hasRespiratoryCondition: false,
      isStale: false,
      activeOverride: null,
      primaryReason: 'হিট ইনডেক্স ৪০.৫°C বিপদজনক সীমা অতিক্রম করেছে',
      maxDurationMinutes: 0,
      requiresShade: true,
    });

    expect(answer).toContain('ফুটবল ম্যাচ ড্রিল');
    expect(answer).toContain('MOVE_INDOORS');
    expect(answer).toContain('ইনডোরে স্থানান্তর');
    expect(answer).toContain('বিজ্ঞান মেলা');
  });

  describe('A-3: MCP Client Integration & tools/list -> toolConfig -> tools/call', () => {
    test('1. McpClient lists tools and converts to Bedrock toolConfig specification', async () => {
      const token = mintMcpTokenForChat('school-dhaka-001', 'TEACHER');
      expect(token).toBeDefined();

      const mcpClient = new McpClient({ scopedToken: token });
      const tools = await mcpClient.listTools();
      expect(tools.length).toBe(3);
      expect(tools.map((t) => t.name)).toEqual(['get_school_decision', 'get_sensor_readings', 'get_outdoor_policy']);

      const bedrockConfig = await mcpClient.getBedrockToolConfig();
      expect(bedrockConfig.tools.length).toBe(3);
      expect(bedrockConfig.tools[0].toolSpec.name).toBe('get_school_decision');
      expect(bedrockConfig.tools[0].toolSpec.inputSchema.json).toBeDefined();
    });

    test('2. McpClient executes tools/call and logs tool calls with execution history', async () => {
      const token = mintMcpTokenForChat('school-dhaka-001', 'TEACHER');
      const mcpClient = new McpClient({ scopedToken: token });

      expect(mcpClient.getToolCallCount()).toBe(0);

      const decisionRes = await mcpClient.callTool('get_school_decision');
      expect(decisionRes.school_id).toBe('school-dhaka-001');
      expect(decisionRes.decision).toBeDefined();
      expect(mcpClient.getToolCallCount()).toBe(1);

      const policyRes = await mcpClient.callTool('get_outdoor_policy', { section: 'AQI_THRESHOLDS' });
      expect(policyRes.doc_id).toBe('airsafe-policy-v1.2');
      expect(mcpClient.getToolCallCount()).toBe(2);

      const history = mcpClient.getToolCallHistory();
      expect(history.length).toBe(2);
      expect(history[0].name).toBe('get_school_decision');
      expect(history[0].status).toBe('success');
      expect(history[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(history[1].name).toBe('get_outdoor_policy');
    });

    test('3. executeBedrockStreamAssistantWithMcp executes MCP tool loop and streams response', async () => {
      // Mock Bedrock ConverseStream to simulate tool calling loop
      async function* mockConverseStream() {
        yield {
          contentBlockStart: {
            start: {
              toolUse: {
                name: 'get_school_decision',
                toolUseId: 'tool_call_001',
              },
            },
          },
        };
        yield {
          contentBlockDelta: {
            delta: {
              toolUse: { input: '{}' },
            },
          },
        };
        yield {
          contentBlockStop: true,
        };
        yield {
          contentBlockDelta: {
            delta: { text: 'Per Model School Outdoor Activity Policy v1.2, conditions require MODIFY.' },
          },
        };
      }

      (jest.spyOn(BedrockRuntimeClient.prototype, 'send') as any).mockResolvedValueOnce({
        stream: mockConverseStream(),
      });

      const token = mintMcpTokenForChat('school-dhaka-001', 'TEACHER');
      const streamedChunks: string[] = [];
      const toolCallEvents: any[] = [];

      const res = await executeBedrockStreamAssistantWithMcp({
        query: 'Is it safe to conduct outdoor cricket practice right now?',
        schoolId: 'school-dhaka-001',
        schoolNameBn: 'ঢাকা মডেল স্কুল',
        schoolNameEn: 'Dhaka Model School',
        isBengali: false,
        mcpToken: token,
        decision: 'MODIFY',
        policyFloorDecision: 'MODIFY',
        heatIndexC: 34.5,
        aqi: 105,
        activeIntensity: 'vigorous',
        routineNameBn: 'ক্রিকেট অনুশীলন',
        routineNameEn: 'Cricket Practice',
        nextActivityBn: null,
        nextActivityEn: null,
        hasRespiratoryCondition: false,
        isStale: false,
        activeOverride: null,
        primaryReason: 'Heat Index 34.5°C requires mandatory shaded rest intervals',
        maxDurationMinutes: 30,
        requiresShade: true,
        onTokenChunk: (delta: string) => {
          streamedChunks.push(delta);
        },
        onToolCall: (event: any) => {
          toolCallEvents.push(event);
        },
      });

      expect(res.decision).toBe('MODIFY');
      expect(res.tools_called_count).toBeGreaterThanOrEqual(1);
      expect(res.tool_calls).toBeDefined();
      expect(res.tool_calls?.length).toBeGreaterThanOrEqual(1);
      expect(toolCallEvents.length).toBeGreaterThanOrEqual(1);
      expect(toolCallEvents[0].name).toBe('get_school_decision');
      expect(streamedChunks.length).toBeGreaterThanOrEqual(1);
      expect(streamedChunks.join('')).toContain('MODIFY');
    });

    test('4. POST /schools/{schoolId}/assistant/chat route returns SSE text/event-stream with tool calls count and tokens', async () => {
      jest
        .spyOn(docClient, 'send')
        .mockResolvedValueOnce({
          Items: [
            {
              school_id: 'school-dhaka-001',
              school_name: 'Dhaka Model School',
              timestamp: new Date().toISOString(),
              is_modeled: false,
              readings: { heat_index_c: 32.0, aqi: 75, pm25_ugm3: 20.0 },
            },
          ],
        } as never)
        .mockResolvedValueOnce({ Item: null } as never)
        .mockResolvedValueOnce({ Item: null } as never)
        .mockResolvedValueOnce({ Item: null } as never);

      // Fast mock for Bedrock
      async function* mockStream() {
        yield {
          contentBlockDelta: {
            delta: { text: 'Model School Outdoor Activity Policy v1.2: PROCEED_WITH_PRECAUTIONS' },
          },
        };
      }
      (jest.spyOn(BedrockRuntimeClient.prototype, 'send') as any).mockResolvedValueOnce({
        stream: mockStream(),
      });

      const teacherToken = createSignedJwt({
        email: 'fatema.teacher@dms.edu.bd',
        school_id: 'school-dhaka-001',
        role: 'TEACHER',
      });

      const chatEvent = {
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/assistant/chat',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          query: 'বর্তমান আবহাওয়ায় শিক্ষার্থীদের মাঠে নেওয়া যাবে?',
          stream: true,
          is_bengali: true,
        }),
      };

      const chatRes = await handler(chatEvent);
      expect(chatRes.statusCode).toBe(200);
      expect(chatRes.headers?.['Content-Type']).toBe('text/event-stream');
      expect(chatRes.body).toContain('event: token');
      expect(chatRes.body).toContain('event: completion');
      expect(chatRes.body).toContain('"tools_called_count":');
    });
  });
});
