/**
 * F-05: Bedrock ConverseStream + MCP Tool Calling + Query Routing + Grounded Citations
 * Architecture per Section A-1, A-2, A-5, A-7
 */

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
  mcpToken: string;
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
}

/**
 * 1. Bedrock Converse Tool Specifications for MCP tools
 */
export const BEDROCK_TOOL_CONFIG = {
  tools: [
    {
      toolSpec: {
        name: 'get_school_decision',
        description: 'Fetch the real-time Policy v1.2 decision, environmental metrics, and shade requirements for the authenticated school',
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
        name: 'get_outdoor_policy',
        description: 'Fetch the authoritative Model School Outdoor Activity Policy v1.2 citation and threshold rules',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              rule_topic: {
                type: 'string',
                description: 'Specific policy section: heat_index, aqi, shade, or all',
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
    return `আপনি এয়ারসেফ স্কুলের (AirSafe Schools) একজন বিশ্বস্ত পরিবেশ ও স্বাস্থ্য সুরক্ষা সহকারী।
আপনার কাজ হলো Model School Outdoor Activity Policy v1.2 অনুসারে শিক্ষকদের আউটডোর কার্যক্রম সম্পর্কে পরামর্শ দেওয়া।
স্কুল: ${schoolNameBn} (${schoolNameEn})

কঠোর নীতিমালার নিয়মাবলী:
১. সবসময় পলিসি v1.2-এর সেফটি ফ্লোর (Safety Floor) মেনে চলুন। কখনোই সার্ভারের সিদ্ধান্তের চেয়ে দুর্বল বা ঝুঁকিপূর্ণ পরামর্শ দেবেন না।
২. আপনার উত্তর সবসময় নির্ভরযোগ্য সাইটেশন (যেমন: Policy v1.2, §1-§4) দিয়ে রেফারেন্স করুন।
৩. যদি ডেটা পুরোনো (>৯০ মিনিট) হয়, সতর্কবার্তা যুক্ত করুন।
৪. শ্বাসকষ্ট বা অ্যাজমার কোনো উল্লেখ থাকলে নিরাপত্তা সীমা ১ ধাপ বাড়িয়ে বিবেচনা করুন।`;
  }

  return `You are the trusted AirSafe Schools Environmental Safety Assistant.
Your duty is to advise school staff and coordinators strictly according to Model School Outdoor Activity Policy v1.2.
School: ${schoolNameEn} (${schoolNameBn})

Strict Grounding Rules:
1. Always adhere strictly to Policy v1.2 safety floors. Never recommend relaxing safety decisions.
2. Provide grounded citations (e.g. Model School Outdoor Activity Policy v1.2, §1–§4).
3. If telemetry is stale (>90 mins), flag warning to user.
4. If respiratory conditions are active, enforce sensitive group step-up.`;
}

/**
 * 3. Query Router: Determines intent and tool requirements
 */
export function routeUserQuery(query: string): {
  needsDecisionTool: boolean;
  needsPolicyTool: boolean;
  detectedTopic: 'HEAT' | 'AQI' | 'ROUTINE' | 'GENERAL';
} {
  const q = query.toLowerCase();
  const needsDecision = /আজকে|এখন|বর্তমান|যাওয়া যাবে|মাঠে|খেলা|পিই|today|now|current|go outside|play|field|pe/.test(q);
  const needsPolicy = /নিয়ম|সীমা|পলিসি|গাইডলাইন|রুল|আইন|rule|policy|threshold|guideline|limit/.test(q);

  let detectedTopic: 'HEAT' | 'AQI' | 'ROUTINE' | 'GENERAL' = 'GENERAL';
  if (/গরম|তাপমাত্রা|হিট|heat|temp|hot/.test(q)) {
    detectedTopic = 'HEAT';
  } else if (/বায়ু|বাতাস|ধুলা|ধোঁয়া|air|aqi|dust|smoke|pm25/.test(q)) {
    detectedTopic = 'AQI';
  } else if (/রুটিন|ক্লাস|routine|class|assembly|সমাবেশ/.test(q)) {
    detectedTopic = 'ROUTINE';
  }

  return {
    needsDecisionTool: needsDecision || !needsPolicy,
    needsPolicyTool: needsPolicy,
    detectedTopic,
  };
}
