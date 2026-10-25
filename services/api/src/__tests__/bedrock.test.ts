import {
  BEDROCK_TOOL_CONFIG,
  buildAssistantSystemPrompt,
  routeUserQuery,
  generateFollowUpSuggestions,
  buildContextualAnswer,
  executeBedrockAssistant,
} from '../bedrock';

describe('F-05: Bedrock ConverseStream + MCP Tool Calling & Query Routing', () => {
  test('Bedrock tool configuration defines valid get_school_decision and get_outdoor_policy tool specs', () => {
    expect(BEDROCK_TOOL_CONFIG.tools).toHaveLength(2);

    const decisionTool = BEDROCK_TOOL_CONFIG.tools.find((t) => t.toolSpec.name === 'get_school_decision');
    expect(decisionTool).toBeDefined();
    expect(decisionTool?.toolSpec.inputSchema.json.properties).toEqual({});

    const policyTool = BEDROCK_TOOL_CONFIG.tools.find((t) => t.toolSpec.name === 'get_outdoor_policy');
    expect(policyTool).toBeDefined();
  });

  test('Query Router correctly identifies field inquiry and routes to decision tool', () => {
    const route1 = routeUserQuery('আজকে কি মাঠে খেলাধুলা করা যাবে?');
    expect(route1.needsDecisionTool).toBe(true);

    const route2 = routeUserQuery('Can students play outside during current PE class?');
    expect(route2.needsDecisionTool).toBe(true);
    expect(route2.detectedTopic).toBe('ROUTINE');
  });

  test('Query Router identifies policy guideline inquiry and routes to policy tool', () => {
    const route = routeUserQuery('হিট ইনডেক্সের জন্য এয়ারসেফ পলিসির নিয়ম ও সীমা কী?');
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
    expect(heatFollowUpsBn[0]).toContain('পানি পান');

    const aqiFollowUpsEn = generateFollowUpSuggestions('AQI', 'MOVE_INDOORS', false);
    expect(aqiFollowUpsEn.length).toBeGreaterThanOrEqual(2);
    expect(aqiFollowUpsEn[0]).toContain('asthma');
  });

  test('buildContextualAnswer produces specific non-template answer addressing query context', () => {
    const answer = buildContextualAnswer({
      query: 'আজকে কি ক্রিকেট বা পিই ক্লাস মাঠে নেওয়া যাবে?',
      schoolNameBn: 'ঢাকা মডেল স্কুল',
      schoolNameEn: 'Dhaka Model School',
      isBengali: true,
      decision: 'MOVE_INDOORS',
      policyFloorDecision: 'MOVE_INDOORS',
      heatIndexC: 40.5,
      aqi: 165,
      activeIntensity: 'vigorous',
      routineNameBn: 'পিই ফুটবল ড্রিল',
      routineNameEn: 'PE Football Drill',
      nextActivityBn: 'বিজ্ঞান মেলা',
      nextActivityEn: 'Science Fair',
      hasRespiratoryCondition: false,
      isStale: false,
      activeOverride: null,
      primaryReason: 'হিট ইনডেক্স ৪০.৫°C বিপদজনক সীমার উপরে',
      maxDurationMinutes: 0,
      requiresShade: true,
    });

    expect(answer).toContain('পিই ফুটবল ড্রিল');
    expect(answer).toContain('MOVE_INDOORS');
    expect(answer).toContain('ইনডোরে স্থানান্তর করতে হবে');
    expect(answer).toContain('বিজ্ঞান মেলা');
  });

  test('executeBedrockAssistant returns grounded response with follow-up suggestions', async () => {
    const res = await executeBedrockAssistant({
      query: 'Can students go outside for light PE?',
      schoolId: 'school-dhaka-001',
      schoolNameBn: 'ঢাকা মডেল স্কুল',
      schoolNameEn: 'Dhaka Model School',
      isBengali: false,
      decision: 'MODIFY',
      policyFloorDecision: 'MODIFY',
      heatIndexC: 34.0,
      aqi: 95,
      activeIntensity: 'light',
      routineNameBn: 'পিই ড্রিল',
      routineNameEn: 'PE Drill',
      nextActivityBn: null,
      nextActivityEn: null,
      hasRespiratoryCondition: false,
      isStale: false,
      activeOverride: null,
      primaryReason: 'Heat Index 34°C requires shaded modification',
      maxDurationMinutes: 30,
      requiresShade: true,
    });

    expect(res.decision).toBe('MODIFY');
    expect(res.suggestedFollowUps).toBeDefined();
    expect(res.suggestedFollowUps?.length).toBeGreaterThanOrEqual(2);
    expect(res.citationId).toBe('Model School Outdoor Activity Policy v1.2, §1–§4');
    expect(res.usedBedrockModel).toBeDefined();
  });
});
