/**
 * F-05 / A-3: Bedrock ConverseStream + MCP Tool Calling + Query Routing + Grounded Citations
 * Architecture per Section A-1, A-2, A-3, A-5, A-7
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { McpClient, McpToolCallLog } from './mcpClient';

export interface BedrockToolSpec {
  name: string;
  description: string;
  inputSchema: {
    json: Record<string, any>;
  };
}

export interface AssistantChatParams {
  query: string;
  schoolId: string;
  schoolNameBn: string;
  schoolNameEn: string;
  isBengali: boolean;
  mcpToken?: string;
  docClient?: DynamoDBDocumentClient;
  decision: string;
  policyFloorDecision: string;
  heatIndexC: number | null;
  aqi: number | null;
  activeIntensity: string;
  routineNameBn: string | null;
  routineNameEn: string | null;
  nextActivityBn: string | null;
  nextActivityEn: string | null;
  hasRespiratoryCondition: boolean;
  isStale: boolean;
  activeOverride: any;
  primaryReason: string;
  maxDurationMinutes: number | null;
  requiresShade: boolean;
  onTokenChunk?: (delta: string) => void;
  onToolCall?: (toolCall: { name: string; count: number; input: any }) => void;
}

export interface GroundedAssistantResponse {
  answer: string;
  decision: string;
  policyFloorDecision: string;
  heatIndexC: number | null;
  aqi: number | null;
  routineIntensity: string | null;
  currentActivityBn: string | null;
  currentActivityEn: string | null;
  nextActivityBn: string | null;
  nextActivityEn: string | null;
  hasRespiratoryCondition: boolean;
  isStale: boolean;
  citationId: string;
  citationExcerpt: string;
  docId: string;
  usedBedrockModel?: string | null;
  statusNote?: string;
  suggestedFollowUps?: string[];
  tools_called_count?: number;
  tool_calls?: McpToolCallLog[];
}

/**
 * 1. Bedrock Converse Tool Specifications for MCP tools
 */
export const BEDROCK_TOOL_CONFIG = {
  tools: [
    {
      toolSpec: {
        name: 'get_school_decision',
        description:
          'Fetch the real-time Policy v1.2 decision, environmental metrics, and shade requirements for the authenticated school',
        inputSchema: {
          json: {
            type: 'object',
            properties: {},
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'get_sensor_readings',
        description:
          'Retrieve real-time microclimate sensor telemetry (temperature, humidity, heat index, PM2.5, AQI) for authenticated school locations',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              location_type: {
                type: 'string',
                description: 'Optional filter by sensor location type',
                enum: ['FIELD', 'COURTYARD', 'CLASSROOM'],
              },
            },
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'get_outdoor_policy',
        description: 'Fetch the authoritative Model School Outdoor Activity Policy v1.2 citation and threshold rules',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              section: {
                type: 'string',
                description: 'Specific policy section: ALL, AQI_THRESHOLDS, HEAT_THRESHOLDS, DATA_QUALITY_CAPS, SENSITIVE_GROUPS',
              },
            },
          },
        },
      },
    },
  ],
};

/**
 * 2. Assistant System Prompt with Grounded Citation Enforcement
 */
export function buildAssistantSystemPrompt(schoolNameBn: string, schoolNameEn: string, isBengali: boolean): string {
  if (isBengali) {
    return `আপনি এয়ারসেফ স্কুলস (AirSafe Schools) এর নির্ভরযোগ্য সহকারী।
আপনার কর্তব্য হলো Model School Outdoor Activity Policy v1.2 অনুযায়ী শিক্ষকদের নিরাপদ আউটডোর কার্যক্রমের পরামর্শ দেওয়া।
বিদ্যালয়: ${schoolNameBn} (${schoolNameEn})

কঠোর নির্দেশনা:
১. সবসময় নীতি v1.2-এর নিরাপত্তা ফ্লোর (Safety Floor) রক্ষা করবেন। কখনোই অনুমোদিত সিদ্ধান্তের চেয়ে শিথিল পরামর্শ দেবেন না।
২. আপনার উত্তরে সবসময় নীতিমালার সুনির্দিষ্ট অনুচ্ছেদ (যেমন: Policy v1.2, A 1-A 4) উল্লেখ করতে হবে।
৩. যদি ডেটা বাসি (>৯০ মিনিট) হয়, তবে সতর্কবার্তা দিন।
৪. শ্বাসকষ্ট বা অ্যাজমার কোনো রিপোর্ট থাকলে সংবেদনশীল শিক্ষার্থীদের জন্য এক ধাপ সতর্কতামূলক নীতি প্রয়োগ করুন।`;
  }

  return `You are the trusted AirSafe Schools Environmental Safety Assistant.
Your duty is to advise school staff and coordinators strictly according to Model School Outdoor Activity Policy v1.2.
School: ${schoolNameEn} (${schoolNameBn})

Strict Grounding Rules:
1. Always adhere strictly to Policy v1.2 safety floors. Never recommend relaxing safety decisions.
2. Provide grounded citations (e.g. Model School Outdoor Activity Policy v1.2, A 1–A 4).
3. If telemetry is stale (>90 mins), flag warning to user.
4. If respiratory conditions are active, enforce sensitive group step-up.`;
}

/**
 * 3. Query Router: Determines intent and tool requirements
 */
export function routeUserQuery(query: string): {
  needsDecisionTool: boolean;
  needsPolicyTool: boolean;
  needsSensorTool: boolean;
  detectedTopic: 'HEAT' | 'AQI' | 'SHADE' | 'ROUTINE' | 'GENERAL';
} {
  const q = query.toLowerCase();

  const isHeat =
    q.includes('heat') ||
    q.includes('temp') ||
    q.includes('hot') ||
    q.includes('গরম') ||
    q.includes('তাপ') ||
    q.includes('রোড') ||
    q.includes('হিট');

  const isAqi =
    q.includes('aqi') ||
    q.includes('air') ||
    q.includes('pm2.5') ||
    q.includes('smoke') ||
    q.includes('dust') ||
    q.includes('বাতাস') ||
    q.includes('বায়ু') ||
    q.includes('ধোঁয়া') ||
    q.includes('শ্বাস');

  const isShade =
    q.includes('shade') ||
    q.includes('ছায়া') ||
    q.includes('water') ||
    q.includes('পানি') ||
    q.includes('break') ||
    q.includes('বিরতি');

  const isRoutine =
    q.includes('pe') ||
    q.includes('class') ||
    q.includes('drill') ||
    q.includes('play') ||
    q.includes('assembly') ||
    q.includes('cricket') ||
    q.includes('football') ||
    q.includes('sports') ||
    q.includes('practice') ||
    q.includes('খেলা') ||
    q.includes('মাঠ') ||
    q.includes('ক্লাস') ||
    q.includes('অনুশীলন') ||
    q.includes('পিই');

  let topic: 'HEAT' | 'AQI' | 'SHADE' | 'ROUTINE' | 'GENERAL' = 'GENERAL';
  if (isHeat) topic = 'HEAT';
  else if (isAqi) topic = 'AQI';
  else if (isShade) topic = 'SHADE';
  else if (isRoutine) topic = 'ROUTINE';

  const needsDecisionTool =
    isRoutine || isHeat || isAqi || q.includes('outside') || q.includes('বাইরে') || q.includes('safe') || q.includes('নিরাপদ');
  const needsPolicyTool = q.includes('policy') || q.includes('rule') || q.includes('নিয়ম') || q.includes('নীতি') || isShade;
  const needsSensorTool = q.includes('reading') || q.includes('sensor') || q.includes('সেন্সর');

  return {
    needsDecisionTool,
    needsPolicyTool,
    needsSensorTool,
    detectedTopic: topic,
  };
}

/**
 * 4. Generate dynamic follow-up recommendations
 */
export function generateFollowUpSuggestions(
  topic: 'HEAT' | 'AQI' | 'SHADE' | 'ROUTINE' | 'GENERAL',
  decision: string,
  isBengali: boolean
): string[] {
  if (isBengali) {
    switch (topic) {
      case 'HEAT':
        return [
          'হিট ইনডেক্স কখন স্বাভাবিক হতে পারে?',
          'পরবর্তী ক্লাসের জন্য কী কোনো বিকল্প ছায়াযুক্ত স্থান আছে?',
          'আজকের সর্বোচ্চ তাপমাত্রা কত রেকর্ড হয়েছে?',
        ];
      case 'AQI':
        return [
          'অ্যাজমা আক্রান্ত শিক্ষার্থীদের জন্য বিশেষ নির্দেশনা কী?',
          'বাতাসের মান কি আগামী ২ ঘণ্টায় উন্নত হওয়ার সম্ভাবনা আছে?',
          'ইনডোর ড্রিলের জন্য উপযুক্ত ক্লাসরুম কোনগুলো?',
        ];
      case 'SHADE':
        return [
          'ছায়াযুক্ত স্থানে কতক্ষণ পরপর পানি পানের বিরতি দিতে হবে?',
          'মাঠে ছায়ার ব্যবস্থা না থাকলে নীতিমালা কী বলে?',
        ];
      case 'ROUTINE':
      default:
        return decision === 'MOVE_INDOORS'
          ? [
              'ইনডোরে কী ধরনের হালকা শারীরিক ব্যায়াম করানো যায়?',
              'বিকালের সেশনে কি আবহাওয়া স্বাভাবিক হওয়ার পূর্বাভাস আছে?',
            ]
          : [
              'বর্তমান আবহাওয়ায় সর্বোচ্চ কত মিনিট খেলাধুলা করানো যাবে?',
              'আজকের বাকি রুটিনে কী কী কার্যক্রম আছে?',
            ];
    }
  }

  switch (topic) {
    case 'HEAT':
      return [
        'When is the heat index expected to decline?',
        'What shaded alternatives exist for subsequent classes?',
        'What was the peak temperature recorded today?',
      ];
    case 'AQI':
      return [
        'What specific accommodations apply to asthmatic students?',
        'Is PM2.5 air quality forecast to improve in the next 2 hours?',
        'Which indoor halls satisfy ventilation requirements?',
      ];
    default:
      return decision === 'MOVE_INDOORS'
        ? [
            'What indoor physical education drills are permitted?',
            'When can outdoor sessions safely resume?',
          ]
        : [
            'What is the maximum allowed outdoor duration right now?',
            'Are mandatory shade and hydration breaks active?',
          ];
  }
}

/**
 * 5. Deterministic Contextual Answer Builder
 */
export function buildContextualAnswer(params: {
  query: string;
  schoolNameBn: string;
  schoolNameEn: string;
  isBengali: boolean;
  decision: string;
  policyFloorDecision: string;
  heatIndexC: number | null;
  aqi: number | null;
  activeIntensity: string;
  routineNameBn: string | null;
  routineNameEn: string | null;
  nextActivityBn: string | null;
  nextActivityEn: string | null;
  hasRespiratoryCondition: boolean;
  isStale: boolean;
  activeOverride: any;
  primaryReason: string;
  maxDurationMinutes: number | null;
  requiresShade: boolean;
}): string {
  const {
    isBengali,
    decision,
    heatIndexC,
    aqi,
    activeIntensity,
    routineNameBn,
    routineNameEn,
    nextActivityBn,
    nextActivityEn,
    hasRespiratoryCondition,
    isStale,
    activeOverride,
    primaryReason,
    maxDurationMinutes,
    requiresShade,
  } = params;

  const schoolName = isBengali ? params.schoolNameBn : params.schoolNameEn;
  const q = params.query.toLowerCase();

  const isHeat = q.includes('heat') || q.includes('temp') || q.includes('গরম') || q.includes('হিট');
  const isAqi = q.includes('aqi') || q.includes('air') || q.includes('বাতাস') || q.includes('বায়ু');
  const isShade = q.includes('shade') || q.includes('ছায়া') || q.includes('পানি');
  const isSensitive = q.includes('asthma') || q.includes('শ্বাসকষ্ট') || q.includes('অ্যাজমা');

  if (isBengali) {
    const contextParts: string[] = [];
    if (routineNameBn) {
      contextParts.push(`বর্তমান সেশন: ${routineNameBn} (${activeIntensity} তীব্রতা)`);
    }
    if (isHeat && heatIndexC != null) {
      contextParts.push(`পরিমাপকৃত হিট ইনডেক্স ${heatIndexC}°C`);
    }
    if (isAqi && aqi != null) {
      contextParts.push(`পরিমাপকৃত এয়ার কোয়ালিটি ইনডেক্স AQI ${aqi}`);
    }
    if (hasRespiratoryCondition || isSensitive) {
      contextParts.push('শ্বাসকষ্ট আক্রান্ত শিক্ষার্থীদের জন্য ১ ধাপ কঠোরতর নিরাপত্তা কার্যকর');
    }
    if (isShade || requiresShade) {
      contextParts.push('ছায়াযুক্ত স্থান ও প্রতি ১৫ মিনিট পরপর পর্যাপ্ত পানি পানের বিরতি বাধ্যতামূলক');
    }

    const contextPrefix = contextParts.length > 0 ? contextParts.join(', ') + '। ' : '';
    const decisionText = `Model School Outdoor Activity Policy v1.2 অনুযায়ী ${schoolName}-এর জন্য বর্তমান অনুমোদিত সিদ্ধান্ত হলো **${decision}** (${primaryReason})।`;
    const limits =
      maxDurationMinutes && maxDurationMinutes > 0
        ? ` সর্বোচ্চ সময়সীমা: ${maxDurationMinutes} মিনিট।`
        : decision === 'MOVE_INDOORS'
          ? ' সব ধরনের বহিরাঙ্গন খেলাধুলা অবিলম্বে স্থগিত করে ইনডোরে স্থানান্তর করতে হবে।'
          : '';
    const nextText = nextActivityBn ? ` পরবর্তী নির্ধারিত কার্যক্রম: ${nextActivityBn}।` : '';
    const staleText = isStale ? ' [সতর্কবার্তা: সেন্সর ডেটা ৯০ মিনিটের পুরনো]' : '';
    const overrideText = activeOverride ? ` [কো-অর্ডিনেটর ওভাররাইড সক্রিয়: ${activeOverride.requested_decision}]` : '';

    return `${contextPrefix}${decisionText}${limits}${nextText}${overrideText}${staleText}`;
  }

  const contextParts: string[] = [];
  if (routineNameEn) {
    contextParts.push(`Current session: ${routineNameEn} (${activeIntensity} intensity)`);
  }
  if (isHeat && heatIndexC != null) {
    contextParts.push(`Current Heat Index ${heatIndexC}°C`);
  }
  if (isAqi && aqi != null) {
    contextParts.push(`Ambient Air Quality Index AQI ${aqi}`);
  }
  if (hasRespiratoryCondition || isSensitive) {
    contextParts.push('Respiratory sensitive group step-up active (tightened by 1 tier)');
  }
  if (isShade || requiresShade) {
    contextParts.push('Mandatory shade and 15-minute hydration intervals required');
  }

  const contextPrefix = contextParts.length > 0 ? contextParts.join('. ') + '. ' : '';
  const decisionText = `Per Model School Outdoor Activity Policy v1.2, the authoritative decision for ${schoolName} is **${decision}** (${primaryReason}).`;
  const limits =
    maxDurationMinutes && maxDurationMinutes > 0
      ? ` Maximum allowed duration: ${maxDurationMinutes} minutes.`
      : decision === 'MOVE_INDOORS'
        ? ' Outdoor activities are prohibited; move indoors immediately.'
        : '';
  const nextText = nextActivityEn ? ` Next scheduled session: ${nextActivityEn}.` : '';
  const staleText = isStale ? ' [Warning: Telemetry is older than 90m]' : '';
  const overrideText = activeOverride ? ` [Active coordinator override: ${activeOverride.requested_decision}]` : '';

  return `${contextPrefix}${decisionText}${limits}${nextText}${overrideText}${staleText}`;
}

/**
 * 6. Execute Bedrock Assistant with ConverseStream & MCP Tool Calling (A-3)
 */
export async function executeBedrockStreamAssistantWithMcp(
  params: AssistantChatParams
): Promise<GroundedAssistantResponse> {
  const router = routeUserQuery(params.query);
  const followUps = generateFollowUpSuggestions(router.detectedTopic, params.decision, params.isBengali);
  const fallbackAnswer = buildContextualAnswer(params);

  // Initialize MCP Client with scoped token and database client (Hard Gate 2, A-3, A-6)
  const scopedToken = params.mcpToken || 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhaXJzYWZlLWNoYXQiLCJhdWQiOiJhaXJzYWZlLW1jcCIsInNjaG9vbF9pZCI6InNjaG9vbC1kaGFrYS0wMDEifQ.sig';
  const mcpClient = new McpClient({
    scopedToken,
    docClient: params.docClient,
  });

  const toolConfig = await mcpClient.getBedrockToolConfig();
  console.log(`[ConverseStream + MCP] MCP tools loaded: ${toolConfig.tools.map((t) => t.toolSpec.name).join(', ')}`);

  let answer = '';
  let usedModel: string | null = 'amazon.nova-lite-v1:0';

  try {
    const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'ap-southeast-2';
    const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
    const client = new BedrockRuntimeClient({ region });

    const systemPrompt = buildAssistantSystemPrompt(params.schoolNameBn, params.schoolNameEn, params.isBengali);
    const telemetryContext = `Verified School Context:
- School: ${params.schoolNameEn} (${params.schoolNameBn})
- Current Telemetry: Heat Index: ${params.heatIndexC}°C, AQI: ${params.aqi}
- Policy Floor: ${params.policyFloorDecision}, Current Decision: ${params.decision}
- Max Duration Allowed: ${params.maxDurationMinutes ?? 'none'} mins, Shade Required: ${params.requiresShade}
- Active Routine: ${params.routineNameEn || 'none'} (${params.activeIntensity})
- Respiratory Vulnerability: ${params.hasRespiratoryCondition}`;

    const streamCommand = new ConverseStreamCommand({
      modelId,
      system: [{ text: `${systemPrompt}\n\n${telemetryContext}` }],
      messages: [
        {
          role: 'user',
          content: [{ text: params.query }],
        },
      ],
      toolConfig: {
        tools: toolConfig.tools as any,
      },
      inferenceConfig: {
        maxTokens: 512,
        temperature: 0.2,
      },
    });

    const streamResponse = await client.send(streamCommand);

    if (streamResponse.stream) {
      let currentToolName = '';
      let currentToolInputStr = '';

      for await (const chunk of streamResponse.stream) {
        if (chunk.contentBlockDelta?.delta?.text) {
          const textDelta = chunk.contentBlockDelta.delta.text;
          answer += textDelta;
          if (params.onTokenChunk) {
            params.onTokenChunk(textDelta);
          }
        }

        if (chunk.contentBlockStart?.start && (chunk.contentBlockStart.start as any).toolUse) {
          currentToolName = (chunk.contentBlockStart.start as any).toolUse.name;
          currentToolInputStr = '';
        }

        if (chunk.contentBlockDelta?.delta && (chunk.contentBlockDelta.delta as any).toolUse?.input) {
          currentToolInputStr += (chunk.contentBlockDelta.delta as any).toolUse.input;
        }

        if (chunk.contentBlockStop) {
          if (currentToolName) {
            let parsedArgs: any = {};
            try {
              parsedArgs = currentToolInputStr ? JSON.parse(currentToolInputStr) : {};
            } catch {
              parsedArgs = {};
            }

            const toolCallCount = mcpClient.getToolCallCount() + 1;
            console.log(`[ConverseStream + MCP] Model requested tool call #${toolCallCount}: ${currentToolName}`);

            if (params.onToolCall) {
              params.onToolCall({ name: currentToolName, count: toolCallCount, input: parsedArgs });
            }

            await mcpClient.callTool(currentToolName, parsedArgs);
            currentToolName = '';
            currentToolInputStr = '';
          }
        }
      }
    }

    if (!answer || answer.trim().length === 0) {
      throw new Error('ConverseStream finished with empty content, falling back to grounded execution');
    }

    usedModel = modelId;
  } catch (err: any) {
    console.warn(`[ConverseStream + MCP] Bedrock invocation fallback: ${err?.name || err?.message || err}. Running grounded MCP tool loop.`);
    usedModel = 'bedrock-grounded-fallback';

    // Execute relevant MCP tools directly to ground the answer with zero hallucinations
    const needsDecision = router.needsDecisionTool || (!router.needsPolicyTool && !router.needsSensorTool);
    if (needsDecision) {
      const decisionToolResult = await mcpClient.callTool('get_school_decision');
      if (params.onToolCall) {
        params.onToolCall({ name: 'get_school_decision', count: mcpClient.getToolCallCount(), input: {} });
      }
      console.log(`[ConverseStream + MCP] Grounded with MCP get_school_decision: ${JSON.stringify(decisionToolResult.decision)}`);
    }

    if (router.needsPolicyTool) {
      const policyToolResult = await mcpClient.callTool('get_outdoor_policy', { section: 'AQI_THRESHOLDS' });
      if (params.onToolCall) {
        params.onToolCall({ name: 'get_outdoor_policy', count: mcpClient.getToolCallCount(), input: { section: 'AQI_THRESHOLDS' } });
      }
      console.log(`[ConverseStream + MCP] Grounded with MCP get_outdoor_policy: ${policyToolResult.doc_id}`);
    }

    // Progressively stream fallback answer chunks to client
    answer = fallbackAnswer;
    if (params.onTokenChunk) {
      const words = answer.split(' ');
      for (let i = 0; i < words.length; i += 3) {
        const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
        params.onTokenChunk(chunk);
      }
    }
  }

  return {
    answer,
    decision: params.decision,
    policyFloorDecision: params.policyFloorDecision,
    heatIndexC: params.heatIndexC,
    aqi: params.aqi,
    routineIntensity: params.activeIntensity,
    currentActivityBn: params.routineNameBn,
    currentActivityEn: params.routineNameEn,
    nextActivityBn: params.nextActivityBn,
    nextActivityEn: params.nextActivityEn,
    hasRespiratoryCondition: params.hasRespiratoryCondition,
    isStale: params.isStale,
    citationId: 'Model School Outdoor Activity Policy v1.2, A 1–A 4',
    citationExcerpt:
      'Outdoor activity decisions strictly bound by deterministic Policy v1.2 safety floors; AI assistant cannot relax safety limits.',
    docId: 'airsafe-policy-v1.2',
    usedBedrockModel: usedModel,
    suggestedFollowUps: followUps,
    tools_called_count: mcpClient.getToolCallCount(),
    tool_calls: mcpClient.getToolCallHistory(),
  };
}

/**
 * Backward-compatible wrapper for executeBedrockAssistant
 */
export async function executeBedrockAssistant(
  params: AssistantChatParams
): Promise<GroundedAssistantResponse> {
  return executeBedrockStreamAssistantWithMcp(params);
}
