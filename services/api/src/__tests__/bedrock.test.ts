import { BEDROCK_TOOL_CONFIG, buildAssistantSystemPrompt, routeUserQuery } from '../bedrock';

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
});
