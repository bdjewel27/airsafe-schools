/**
 * Demonstration runner for A-3: ConverseStream + MCP Client Tool Calling & SSE Streaming
 *
 * Simulates:
 * 1. Minting short-lived scoped MCP token (mintMcpTokenForChat)
 * 2. MCP tools/list -> Bedrock toolConfig mapping
 * 3. Bedrock ConverseStream + MCP tools/call loop execution
 * 4. Progressive token streaming in SSE format
 * 5. Log recording of tool calls count and timing for phone client
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { executeBedrockStreamAssistantWithMcp } from './bedrock';
import { mintMcpTokenForChat } from './index';

async function runChatStreamDemo() {
  console.log('================================================================================');
  console.log('A-3: BEDROCK CONVERSESTREAM + MCP CLIENT EXECUTION & PHONE STREAMING LOG');
  console.log('Target Architecture: SSE Streaming (text/event-stream) + Model Context Protocol');
  console.log('================================================================================\n');

  const schoolId = 'school-dhaka-001';
  const role = 'TEACHER';

  // 1. Mint short-lived scoped MCP Token (Section A-6)
  console.log('>>> STEP 1: Minting 5-minute scoped MCP Bearer Token');
  process.env.MCP_JWT_SECRET = process.env.MCP_JWT_SECRET || 'test-suite-secure-mcp-secret-for-jest-only-32bytes';
  const mcpToken = mintMcpTokenForChat(schoolId, role);
  console.log('- Minted Scoped Token (first 35 chars):', mcpToken.substring(0, 35) + '...');
  console.log('- Token Audience: airsafe-mcp | Issuer: airsafe-chat | Lifetime: 300s (<=5m)\n');

  // 2. Setup mock stream to demonstrate ConverseStream toolUse -> tools/call -> final streaming
  console.log('>>> STEP 2: Connecting ConverseStream to MCP Server (tools/list -> toolConfig)');
  async function* mockConverseStream() {
    // Model emits tool call to inspect real-time school decision
    yield {
      contentBlockStart: {
        start: {
          toolUse: {
            name: 'get_school_decision',
            toolUseId: 'call_live_001',
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
    // Model generates streamed grounded explanation in Bengali
    const streamTokens = [
      'Model ', 'School ', 'Outdoor ', 'Activity ', 'Policy ', 'v1.2 ', 'অনুযায়ী ',
      'বর্তমান ', 'হিট ', 'ইনডেক্স ', '৩৪.৫°C। ', 'অতএব, ', 'আউটডোর ', 'শারীরিক ',
      'কার্যক্রম ', '**MODIFY** ', 'করতে ', 'হবে। ', 'ছায়াযুক্ত ', 'স্থানে ', 'প্রতি ',
      '১৫ ', 'মিনিট ', 'পরপর ', 'পানি ', 'পানের ', 'বিরতি ', 'বাধ্যতামূলক।'
    ];
    for (const tok of streamTokens) {
      yield {
        contentBlockDelta: {
          delta: { text: tok },
        },
      };
    }
  }

  (jestSpySend())(mockConverseStream);

  // 3. Execute Streaming with Phone Event Recording
  console.log('>>> STEP 3: Executing ConverseStream with Phone SSE Listener');
  console.log('[Phone Client] Connected to SSE stream: POST /schools/school-dhaka-001/assistant/chat');
  console.log('--------------------------------------------------------------------------------');

  const recordedSseEvents: string[] = [];
  let tokenCount = 0;

  const result = await executeBedrockStreamAssistantWithMcp({
    query: 'বর্তমান আবহাওয়ায় কি আউটডোর পিই ক্লাস নেওয়া যাবে?',
    schoolId,
    schoolNameBn: 'ঢাকা মডেল স্কুল',
    schoolNameEn: 'Dhaka Model School',
    isBengali: true,
    mcpToken,
    decision: 'MODIFY',
    policyFloorDecision: 'MODIFY',
    heatIndexC: 34.5,
    aqi: 95,
    activeIntensity: 'vigorous',
    routineNameBn: 'পিই ক্লাস',
    routineNameEn: 'PE Drill',
    nextActivityBn: 'বিজ্ঞান মেলা',
    nextActivityEn: 'Science Fair',
    hasRespiratoryCondition: false,
    isStale: false,
    activeOverride: null,
    primaryReason: 'Heat Index 34.5°C requires mandatory shaded intervals',
    maxDurationMinutes: 30,
    requiresShade: true,
    onToolCall: (event) => {
      const sseEvent = `event: tool_call\ndata: ${JSON.stringify(event)}`;
      recordedSseEvents.push(sseEvent);
      console.log(`[PHONE SSE INCOMING] ${sseEvent.replace(/\n/g, ' ')}`);
    },
    onTokenChunk: (delta) => {
      tokenCount++;
      const sseEvent = `event: token\ndata: ${JSON.stringify({ delta })}`;
      recordedSseEvents.push(sseEvent);
      process.stdout.write(delta);
    },
  });

  console.log('\n--------------------------------------------------------------------------------');
  console.log('\n>>> STEP 4: SSE Stream Completion & Tool Calls Verification');
  console.log('- Total Tool Calls Executed:', result.tools_called_count);
  console.log('- Tool Calls Detail:', JSON.stringify(result.tool_calls?.map(t => ({ name: t.name, duration: `${t.durationMs}ms`, status: t.status }))));
  console.log('- Total Streamed Chunks Received by Phone:', tokenCount);
  console.log('- Citation Grounding:', result.citationId);
  console.log('- Policy Doc ID:', result.docId);
  console.log('- Final Decision Enforced:', result.decision);
  console.log('================================================================================');
}

function jestSpySend() {
  return (generatorFn: any) => {
    (BedrockRuntimeClient.prototype as any).send = async () => ({
      stream: generatorFn(),
    });
  };
}

runChatStreamDemo().catch(console.error);
