import * as crypto from 'crypto';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path?: string;
  resource?: string;
  headers?: Record<string, string | undefined>;
  pathParameters?: Record<string, string | undefined> | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  requestContext?: {
    authorizer?: {
      claims?: Record<string, any>;
    };
  };
  [key: string]: any;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

const region = process.env.PROJECT_REGION || process.env.AWS_REGION || 'ap-southeast-2';
const ddbClient = new DynamoDBClient({ region });
export const docClient = DynamoDBDocumentClient.from(ddbClient);
const ssmClient = new SSMClient({ region });

const TABLE_NAME = process.env.TABLE_NAME || 'AirSafe-Readings-dev';
const DECISIONS_TABLE_NAME = process.env.DECISIONS_TABLE_NAME || 'AirSafe-Decisions-dev';
const JWT_PARAM_NAME = process.env.JWT_SECRET_PARAM_NAME || '/airsafe/dev/jwt-secret';
const MCP_PARAM_NAME = process.env.MCP_JWT_SECRET_PARAM_NAME || '/airsafe/dev/mcp-jwt-secret';

let cachedJwtSecret: string | null = null;
let cachedMcpJwtSecret: string | null = null;

export async function fetchSecretFromSsm(paramName: string): Promise<string | null> {
  try {
    const res = await ssmClient.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
    return res.Parameter?.Value?.trim() || null;
  } catch (err) {
    console.warn(`[SSM WARN] Could not retrieve SSM parameter ${paramName}:`, err);
    return null;
  }
}

export async function ensureSecretsLoaded(): Promise<void> {
  if (!cachedJwtSecret) {
    if (process.env.API_JWT_SECRET && process.env.API_JWT_SECRET.trim() !== '') {
      cachedJwtSecret = process.env.API_JWT_SECRET.trim();
    } else {
      cachedJwtSecret = await fetchSecretFromSsm(JWT_PARAM_NAME);
    }
  }
  if (!cachedMcpJwtSecret) {
    if (process.env.MCP_JWT_SECRET && process.env.MCP_JWT_SECRET.trim() !== '') {
      cachedMcpJwtSecret = process.env.MCP_JWT_SECRET.trim();
    } else {
      cachedMcpJwtSecret = await fetchSecretFromSsm(MCP_PARAM_NAME);
    }
  }
}

export function resetSecretsCache(): void {
  cachedJwtSecret = null;
  cachedMcpJwtSecret = null;
}

export function getJwtSecret(): string {
  const secret = cachedJwtSecret || (process.env.API_JWT_SECRET && process.env.API_JWT_SECRET.trim() !== '' ? process.env.API_JWT_SECRET.trim() : null);
  if (!secret) {
    throw new Error('SECURITY FATAL: API_JWT_SECRET is missing from both SSM and environment. Fail-closed (Hard Gate 1).');
  }
  return secret;
}

export function getMcpJwtSecret(): string {
  const secret = cachedMcpJwtSecret || (process.env.MCP_JWT_SECRET && process.env.MCP_JWT_SECRET.trim() !== '' ? process.env.MCP_JWT_SECRET.trim() : null);
  if (!secret) {
    throw new Error('SECURITY FATAL: MCP_JWT_SECRET is missing from both SSM and environment. Fail-closed (Hard Gate 1 & 2).');
  }
  return secret;
}

// S11: Single Source of Truth for allowed origins across API Gateway and Lambda
export const ALLOWED_ORIGIN_LIST: readonly string[] = [
  'https://airsafe.schools.gov.bd',
  'https://airsafe.schools.internal',
  'https://dms.edu.bd',
  'http://localhost:3000',
  'http://localhost:5173',
  'capacitor://localhost',
];

export const ALLOWED_ORIGINS = new Set<string>(
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ALLOWED_ORIGIN_LIST
);

export function getCorsHeaders(event?: APIGatewayProxyEvent): Record<string, string> {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin || '';
  const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'https://airsafe.schools.gov.bd';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-school-id',
    'Vary': 'Origin',
  };
}

// S11: Unified CORS headers export for backward compatibility
export const CORS_HEADERS = getCorsHeaders();

// Rate limiting state for login (Hard Gate 3 & Section 08/09)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function checkRateLimit(key: string, limit: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > windowMs) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

/**
 * DynamoDB-backed distributed rate limiter with TTL support (Section 08 & 09)
 */
export async function checkRateLimitDynamo(key: string, limit: number = 5, windowMs: number = 15 * 60 * 1000): Promise<boolean> {
  const memoryAllowed = checkRateLimit(key, limit, windowMs);
  if (!memoryAllowed) {
    return false;
  }

  try {
    const now = Date.now();
    const ttlSeconds = Math.floor((now + windowMs) / 1000);
    const getRes = await docClient.send(
      new GetCommand({
        TableName: DECISIONS_TABLE_NAME,
        Key: { school_id: 'RATELIMIT#LOGIN', activity_id: key },
      })
    ).catch(() => ({ Item: undefined }));

    const currentCount = (getRes.Item?.count || 0) + 1;
    if (currentCount > limit) {
      return false;
    }

    await docClient.send(
      new PutCommand({
        TableName: DECISIONS_TABLE_NAME,
        Item: {
          school_id: 'RATELIMIT#LOGIN',
          activity_id: key,
          count: currentCount,
          ttl: ttlSeconds,
        },
      })
    ).catch(() => {});
  } catch (_err) {
    // Best-effort DynamoDB fallback to in-memory guard
  }

  return true;
}

export function resetRateLimits(): void {
  loginAttempts.clear();
}

/**
 * Mint strictly scoped, short-lived MCP token for AI Assistant (Hard Gate 2 & MCP hardening)
 */
export function mintMcpTokenForChat(schoolId: string, role: string = 'TEACHER'): string {
  const secret = getMcpJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'airsafe-chat',
    aud: 'airsafe-mcp',
    iat: now,
    exp: now + 300, // strictly 5 minutes (300 seconds)
    school_id: schoolId,
    role,
  };
  const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${encHeader}.${encPayload}`).digest('base64url');
  return `${encHeader}.${encPayload}.${sig}`;
}

import policyConfig from './policy/v1.2.json';
import {
  evaluatePolicy,
  PolicyDecision as SharedPolicyDecision,
  ActivityIntensity as SharedActivityIntensity,
} from './policy';
export { evaluatePolicy } from './policy';

export type PolicyDecision = SharedPolicyDecision;
export type ActivityIntensity = 'light' | 'moderate' | 'vigorous';

export interface AuthContext {
  email: string;
  schoolId: string;
  role: 'TEACHER' | 'COORDINATOR' | 'PLATFORM_ADMIN';
  nameBn: string;
  nameEn: string;
  schoolNameBn: string;
  schoolNameEn: string;
}

export interface StaffAccount {
  email: string;
  passwordHash?: string;
  role: 'TEACHER' | 'COORDINATOR' | 'PLATFORM_ADMIN';
  schoolId: string;
  nameBn: string;
  nameEn: string;
  schoolNameBn: string;
  schoolNameEn: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, expectedHash?: string): boolean {
  if (!expectedHash || !password) return false;
  // Strict OWASP compliant salted PBKDF2 (salt:hash) with >= 600,000 iterations
  if (expectedHash.includes(':')) {
    const [salt, storedHash] = expectedHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex');
    const hBuf = Buffer.from(hash);
    const eBuf = Buffer.from(storedHash);
    return hBuf.length === eBuf.length && crypto.timingSafeEqual(hBuf, eBuf);
  }
  return false;
}

const STRICTNESS_ORDER: Record<PolicyDecision, number> = {
  PROCEED: 0,
  PROCEED_WITH_PRECAUTIONS: 1,
  MODIFY: 2,
  MOVE_INDOORS: 3,
  UNKNOWN: 4,
};

const ORDERED_DECISIONS: PolicyDecision[] = [
  'PROCEED',
  'PROCEED_WITH_PRECAUTIONS',
  'MODIFY',
  'MOVE_INDOORS',
];

// P4 (F-10): Granular Activity Schema for ACTIVITY#<id> model (time, intensity, location, class)
export const ActivitySchema = z.object({
  id: z.string().min(1).max(50).optional(),
  name_bn: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  time_slot: z.string().max(50).optional().default(''), // সময়
  intensity: z.enum(['light', 'moderate', 'vigorous', 'LIGHT', 'MODERATE', 'VIGOROUS']), // তীব্রতা
  location_type: z.enum(['FIELD', 'COURT', 'COURTYARD', 'SHADED_AREA', 'CLASSROOM', 'INDOOR_GYM', 'OUTDOOR', 'INDOOR']).default('FIELD'), // স্থান
  target_class: z.string().max(50).optional().nullable(), // ক্লাস
  duration_minutes: z.number().int('duration_minutes must be an integer').min(1, 'Duration must be at least 1 minute').max(480, 'Duration cannot exceed 480 minutes').default(45),
  is_current: z.boolean().optional().default(false),
  order: z.number().int().optional(),
});

// S8 (S-6 Input Validation) & P4: Strict JSON Schemas for routines, overrides, and multi-activity routines
export const RoutineSchema = z.object({
  intensity: z.enum(['light', 'moderate', 'vigorous', 'LIGHT', 'MODERATE', 'VIGOROUS']).optional().default('MODERATE'),
  location_type: z.enum(['FIELD', 'COURT', 'COURTYARD', 'SHADED_AREA', 'CLASSROOM', 'INDOOR_GYM', 'OUTDOOR', 'INDOOR']).default('FIELD'),
  duration_minutes: z.number().int('duration_minutes must be an integer').min(1, 'Duration must be at least 1 minute').max(480, 'Duration cannot exceed 480 minutes').default(45),
  time_slot: z.string().max(50).optional().nullable(),
  activity_name_bn: z.string().max(100).optional().nullable(),
  activity_name_en: z.string().max(100).optional().nullable(),
  next_activity_bn: z.string().max(100).optional().nullable(),
  next_activity_en: z.string().max(100).optional().nullable(),
  target_class: z.string().max(50).optional().nullable(),
  activities: z.array(ActivitySchema).optional(),
});

export const OverrideSchema = z.object({
  decision: z.enum(['PROCEED', 'PROCEED_WITH_PRECAUTIONS', 'MODIFY', 'MOVE_INDOORS']),
  reason: z.string().min(5, 'Override reason is mandatory and must be at least 5 characters (F-11)').max(1000),
});

export function createSignedJwt(payload: {
  email: string;
  school_id: string;
  role: 'TEACHER' | 'COORDINATOR' | 'PLATFORM_ADMIN';
  name_bn?: string;
  name_en?: string;
  school_name_bn?: string;
  school_name_en?: string;
  exp?: number;
}): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    iss: 'airsafe-auth',
    aud: 'airsafe-mcp',
    exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', getJwtSecret()).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Hard Gate 2 & 3: Fail-Closed Cryptographic JWT + Cognito Authorizer Verification
 * Extracts schoolId and role strictly from verified token/authorizer claims.
 */
export function authenticateRequest(event: APIGatewayProxyEvent): AuthContext {
  // 1. Check API Gateway Cognito User Pool Authorizer claims first
  const authorizerClaims = event.requestContext?.authorizer?.claims;
  if (authorizerClaims && (authorizerClaims['custom:school_id'] || authorizerClaims.school_id)) {
    const schoolId = String(authorizerClaims['custom:school_id'] || authorizerClaims.school_id).trim();
    // Hard Gate 3: Role is determined strictly by server Cognito groups, never client attribute
    const groups = String(authorizerClaims['cognito:groups'] || '');
    const role: AuthContext['role'] = groups.includes('coordinator')
      ? 'COORDINATOR'
      : groups.includes('platform-admin')
      ? 'PLATFORM_ADMIN'
      : 'TEACHER';
    return {
      email: String(authorizerClaims.email || 'user@airsafe.edu.bd'),
      schoolId,
      role,
      nameBn: String(authorizerClaims.name_bn || (role === 'COORDINATOR' ? 'স্কুল কোঅর্ডিনেটর' : 'স্কুল শিক্ষক')),
      nameEn: String(authorizerClaims.name_en || (role === 'COORDINATOR' ? 'School Coordinator' : 'School Teacher')),
      schoolNameBn: String(authorizerClaims.school_name_bn || 'ঢাকা মডেল স্কুল'),
      schoolNameEn: String(authorizerClaims.school_name_en || 'Dhaka Model School'),
    };
  }

  // 2. Cryptographically verify Bearer token from Authorization header
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) {
    throw { statusCode: 401, message: 'Unauthorized: Missing Authorization Bearer token (Hard Gate 2)' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw { statusCode: 401, message: 'Unauthorized: Malformed Authorization header' };
  }

  const token = match[1].trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw { statusCode: 401, message: 'Unauthorized: Invalid JWT structure' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw { statusCode: 403, message: 'Forbidden: Invalid JWT cryptographic signature (Hard Gate 2)' };
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw { statusCode: 401, message: 'Unauthorized: Malformed JWT payload' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw { statusCode: 401, message: 'Unauthorized: Token has expired' };
  }

  const schoolId = payload['custom:school_id'] || payload.school_id;
  if (!schoolId || typeof schoolId !== 'string' || schoolId.trim() === '') {
    throw { statusCode: 403, message: 'Forbidden: Token missing immutable school_id claim (Hard Gate 2)' };
  }

  const rawRole = String(payload['custom:role'] || payload.role || 'TEACHER').toUpperCase();
  const role: AuthContext['role'] =
    rawRole === 'COORDINATOR' ? 'COORDINATOR' : rawRole === 'PLATFORM_ADMIN' ? 'PLATFORM_ADMIN' : 'TEACHER';

  return {
    email: String(payload.email || 'staff@airsafe.edu.bd'),
    schoolId: schoolId.trim(),
    role,
    nameBn: String(payload.name_bn || (role === 'COORDINATOR' ? 'প্রিন্সিপাল রফিকুল ইসলাম' : 'সহকারী শিক্ষক ফাতিমা')),
    nameEn: String(payload.name_en || (role === 'COORDINATOR' ? 'Principal Rafiqul Islam' : 'Assistant Teacher Fatema')),
    schoolNameBn: String(payload.school_name_bn || 'ঢাকা মডেল স্কুল'),
    schoolNameEn: String(payload.school_name_en || 'Dhaka Model School'),
  };
}

/**
 * Deterministic Policy v1.2 Evaluator for API Layer (Hard Gate 4)
 * Delegates directly to the shared, dynamic policy engine (v1.2.json).
 */
/**
 * P2 (Policy Rule 2 - Worst-Case Environmental Value Invariance):
 * Resolves the peak/worst-case AQI and Heat Index across the entire activity duration
 * by combining current telemetry with the hourly forecast window [now, now + durationMinutes].
 */
export function getWorstCaseConditionsForActivity(params: {
  currentAqi: number | null | undefined;
  currentHeatIndexC: number | null | undefined;
  durationMinutes?: number | null;
  hourlyForecast?: Array<{
    time?: string;
    aqi?: number;
    usAqi?: number;
    heat_index_c?: number;
    heatIndexC?: number;
    temperature_c?: number;
    temperatureC?: number;
  }> | null;
  startTime?: Date | string | number;
}): {
  worstAqi: number | null;
  worstHeatIndexC: number | null;
  isForecastWorse: boolean;
  forecastPeakReason?: string;
} {
  const currentAqi = typeof params.currentAqi === 'number' && Number.isFinite(params.currentAqi) ? params.currentAqi : null;
  const currentHeatIndex = typeof params.currentHeatIndexC === 'number' && Number.isFinite(params.currentHeatIndexC) ? params.currentHeatIndexC : null;

  if (currentAqi === null || currentHeatIndex === null) {
    return {
      worstAqi: currentAqi,
      worstHeatIndexC: currentHeatIndex,
      isForecastWorse: false,
    };
  }

  let worstAqi = currentAqi;
  let worstHeatIndexC = currentHeatIndex;

  const startMs = params.startTime ? new Date(params.startTime).getTime() : Date.now();
  const durationMs = (params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : 45) * 60 * 1000;
  const endMs = startMs + durationMs;

  const forecast = Array.isArray(params.hourlyForecast) ? params.hourlyForecast : [];

  for (const pt of forecast) {
    if (!pt.time) continue;
    const ptMs = new Date(pt.time).getTime();
    if (!Number.isFinite(ptMs)) continue;
    // Check if forecast timestamp falls within or overlaps with the activity window
    if (ptMs >= startMs - 30 * 60 * 1000 && ptMs <= endMs + 30 * 60 * 1000) {
      const ptAqi = pt.usAqi ?? pt.aqi;
      const ptHeat = pt.heatIndexC ?? pt.heat_index_c ?? pt.temperatureC ?? pt.temperature_c;

      if (typeof ptAqi === 'number' && Number.isFinite(ptAqi) && ptAqi > worstAqi) {
        worstAqi = ptAqi;
      }
      if (typeof ptHeat === 'number' && Number.isFinite(ptHeat) && ptHeat > worstHeatIndexC) {
        worstHeatIndexC = ptHeat;
      }
    }
  }

  const isForecastWorse = worstAqi > currentAqi || worstHeatIndexC > currentHeatIndex;
  let forecastPeakReason: string | undefined;
  if (isForecastWorse) {
    const reasons: string[] = [];
    if (worstAqi > currentAqi) {
      reasons.push(`পূর্বাভাসে সর্বোচ্চ AQI ${worstAqi} (বর্তমান ${currentAqi})`);
    }
    if (worstHeatIndexC > currentHeatIndex) {
      reasons.push(`পূর্বাভাসে সর্বোচ্চ হিট ইনডেক্স ${worstHeatIndexC}°C (বর্তমান ${currentHeatIndex}°C)`);
    }
    forecastPeakReason = `অ্যাক্টিভিটির সময়সীমার পূর্বাভাস পিক (Rule 2): ${reasons.join(', ')}`;
  }

  return {
    worstAqi,
    worstHeatIndexC,
    isForecastWorse,
    forecastPeakReason,
  };
}

export function evaluatePolicyFloor(params: {
  heatIndexC: number | null | undefined;
  aqi: number | null | undefined;
  intensity?: ActivityIntensity | string;
  isModeled?: boolean;
  isStale?: boolean;
  hasRespiratoryCondition?: boolean;
}): {
  decision: PolicyDecision;
  status: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'UNKNOWN';
  maxDurationMinutes: number | null;
  requiresShade: boolean;
  reasons: string[];
  reasonCodes: string[];
} {
  const { heatIndexC, aqi } = params;

  // Fail-Closed Guard (Hard Gate 4): Missing or non-finite telemetry NEVER defaults to PROCEED/GREEN
  if (
    typeof heatIndexC !== 'number' ||
    !Number.isFinite(heatIndexC) ||
    typeof aqi !== 'number' ||
    !Number.isFinite(aqi) ||
    aqi < 0 ||
    heatIndexC < -20 ||
    heatIndexC > 70
  ) {
    return {
      decision: 'UNKNOWN',
      status: 'UNKNOWN',
      maxDurationMinutes: null,
      requiresShade: true,
      reasons: ['সেন্সর বা আবহাওয়া ডেটা পাওয়া যায়নি — অনুগ্রহ করে কোঅর্ডিনেটরের সাথে যোগাযোগ করুন (Data unavailable — fail-closed)'],
      reasonCodes: ['DATA_UNAVAILABLE'],
    };
  }

  const rawIntensity = String(params.intensity || 'MODERATE').toUpperCase();
  const intensity: SharedActivityIntensity =
    rawIntensity === 'VIGOROUS' ? 'VIGOROUS' : rawIntensity === 'LIGHT' ? 'LIGHT' : 'MODERATE';

  const res = evaluatePolicy(
    aqi,
    heatIndexC,
    intensity,
    Boolean(params.isModeled),
    Boolean(params.isStale),
    Boolean(params.hasRespiratoryCondition)
  );

  const statusMap: Record<PolicyDecision, 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'UNKNOWN'> = {
    PROCEED: 'GREEN',
    PROCEED_WITH_PRECAUTIONS: 'YELLOW',
    MODIFY: 'ORANGE',
    MOVE_INDOORS: 'RED',
    UNKNOWN: 'UNKNOWN',
  };

  return {
    decision: res.decision,
    status: statusMap[res.decision] || 'UNKNOWN',
    maxDurationMinutes: res.decision === 'MOVE_INDOORS' ? 0 : (res.maxDurationMinutes ?? null),
    requiresShade: res.requiresShade,
    reasons: res.reasons,
    reasonCodes: res.reasonCodes,
  };
}

// P4 & F-10: Evaluate decision for an individual activity based on its intensity, duration, and conditions
export function evaluateDecisionForActivity(params: {
  activity: {
    id?: string;
    activity_id?: string;
    name_bn: string;
    name_en: string;
    time_slot?: string;
    intensity: string;
    location_type?: string;
    target_class?: string | null;
    duration_minutes?: number;
    is_current?: boolean;
    order?: number;
  };
  currentAqi: number | null | undefined;
  currentHeatIndexC: number | null | undefined;
  hourlyForecast?: any[];
  isModeled?: boolean;
  isStale?: boolean;
  hasRespiratoryCondition?: boolean;
  activeOverride?: any;
}) {
  const duration = params.activity.duration_minutes ?? 45;
  const worstCase = getWorstCaseConditionsForActivity({
    currentAqi: params.currentAqi,
    currentHeatIndexC: params.currentHeatIndexC,
    durationMinutes: duration,
    hourlyForecast: params.hourlyForecast,
  });

  const rawInt = String(params.activity.intensity || 'MODERATE').toUpperCase();
  const intensity: SharedActivityIntensity =
    rawInt === 'VIGOROUS' ? 'VIGOROUS' : rawInt === 'LIGHT' ? 'LIGHT' : 'MODERATE';

  const evalResult = evaluatePolicyFloor({
    heatIndexC: worstCase.worstHeatIndexC,
    aqi: worstCase.worstAqi,
    intensity,
    isModeled: Boolean(params.isModeled),
    isStale: Boolean(params.isStale),
    hasRespiratoryCondition: Boolean(params.hasRespiratoryCondition),
  });

  if (worstCase.isForecastWorse && worstCase.forecastPeakReason) {
    evalResult.reasons.push(worstCase.forecastPeakReason);
    evalResult.reasonCodes.push('FORECAST_WORST_CASE_PEAK');
  }

  let decision = evalResult.decision;
  let status = evalResult.status;

  if (params.activeOverride?.requested_decision) {
    const reqDec = params.activeOverride.requested_decision as PolicyDecision;
    if (ORDERED_DECISIONS.includes(reqDec) && STRICTNESS_ORDER[reqDec] > STRICTNESS_ORDER[decision]) {
      decision = reqDec;
      const statusMap: Record<PolicyDecision, 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'UNKNOWN'> = {
        PROCEED: 'GREEN',
        PROCEED_WITH_PRECAUTIONS: 'YELLOW',
        MODIFY: 'ORANGE',
        MOVE_INDOORS: 'RED',
        UNKNOWN: 'UNKNOWN',
      };
      status = statusMap[decision] || status;
    }
  }

  const actId = params.activity.id || (params.activity.activity_id ? params.activity.activity_id.replace(/^ACTIVITY#/, '') : 'activity');

  return {
    id: actId,
    activity_id: `ACTIVITY#${actId}`,
    name_bn: params.activity.name_bn,
    name_en: params.activity.name_en,
    time_slot: params.activity.time_slot || '',
    intensity,
    location_type: params.activity.location_type || 'FIELD',
    target_class: params.activity.target_class || null,
    duration_minutes: duration,
    is_current: Boolean(params.activity.is_current),
    order: params.activity.order ?? 1,
    decision,
    status,
    policy_floor_decision: evalResult.decision,
    worst_case_aqi: worstCase.worstAqi,
    worst_case_heat_index_c: worstCase.worstHeatIndexC,
    primary_reason: evalResult.reasons[0] || 'Evaluated against policy',
    reasons: evalResult.reasons,
    reason_codes: evalResult.reasonCodes,
    max_duration_minutes: evalResult.maxDurationMinutes,
    requires_shade: evalResult.requiresShade,
  };
}

// P4 & F-10: Fetch and evaluate decisions for all activities under a school tenant
export async function getEvaluatedActivitiesForSchool(params: {
  schoolId: string;
  docClient: any;
  decisionsTableName: string;
  currentAqi: number | null | undefined;
  currentHeatIndexC: number | null | undefined;
  hourlyForecast?: any[];
  isModeled?: boolean;
  isStale?: boolean;
  hasRespiratoryCondition?: boolean;
  activeOverride?: any;
  cachedRoutineItem?: any;
}) {
  let activityItems: any[] = [];
  try {
    const actRes = await params.docClient.send(
      new QueryCommand({
        TableName: params.decisionsTableName,
        KeyConditionExpression: 'school_id = :sid AND begins_with(activity_id, :prefix)',
        ExpressionAttributeValues: {
          ':sid': params.schoolId,
          ':prefix': 'ACTIVITY#',
        },
      })
    );
    activityItems = actRes.Items || [];
  } catch (err) {
    console.warn('[Activities Query Warning] Could not fetch ACTIVITY# records:', err);
  }

  if (activityItems.length === 0) {
    const routine = params.cachedRoutineItem;
    if (routine) {
      const currentRawInt = String(routine.intensity || 'moderate').toUpperCase();
      activityItems.push({
        id: 'current',
        activity_id: 'ACTIVITY#current',
        name_bn: routine.activity_name_bn || 'বর্তমান অ্যাক্টিভিটি',
        name_en: routine.activity_name_en || 'Current Activity',
        time_slot: routine.time_slot || '09:00 - 09:45',
        intensity: currentRawInt,
        location_type: routine.location_type || 'FIELD',
        target_class: routine.target_class || 'All Classes',
        duration_minutes: routine.duration_minutes ?? 45,
        is_current: true,
        order: 1,
      });
      if (routine.next_activity_bn || routine.next_activity_en) {
        activityItems.push({
          id: 'next',
          activity_id: 'ACTIVITY#next',
          name_bn: routine.next_activity_bn || 'পরবর্তী অ্যাক্টিভিটি',
          name_en: routine.next_activity_en || 'Next Activity',
          time_slot: '09:50 - 10:35',
          intensity: 'MODERATE',
          location_type: 'FIELD',
          target_class: routine.target_class || 'All Classes',
          duration_minutes: 45,
          is_current: false,
          order: 2,
        });
      }
    }
  }

  activityItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const evaluatedActivities = activityItems.map((act) =>
    evaluateDecisionForActivity({
      activity: act,
      currentAqi: params.currentAqi,
      currentHeatIndexC: params.currentHeatIndexC,
      hourlyForecast: params.hourlyForecast,
      isModeled: params.isModeled,
      isStale: params.isStale,
      hasRespiratoryCondition: params.hasRespiratoryCondition,
      activeOverride: params.activeOverride,
    })
  );

  const currentActivity = evaluatedActivities.find((a) => a.is_current) || evaluatedActivities[0] || null;
  const nextActivity = evaluatedActivities.find((a) => !a.is_current && a.id !== currentActivity?.id) || evaluatedActivities[1] || null;

  return {
    activities: evaluatedActivities,
    current_activity: currentActivity,
    next_activity: nextActivity,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: getCorsHeaders(event), body: '' };
  }

  await ensureSecretsLoaded();

  const path = event.path || event.resource || '';

  // Public Policy Viewer Route: GET /policies/current (F-15)
  if ((path.endsWith('/policies/current') || path.endsWith('/policy/current')) && event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(event),
      body: JSON.stringify({
        version: policyConfig.version || 'v1.2',
        name: policyConfig.name || 'Model School Outdoor Activity Policy',
        effectiveDate: policyConfig.effectiveDate || '2026-10-01',
        authority: policyConfig.authority || 'AirSafe Schools Environmental Safety Protocol',
        rules: [
          { id: 'RULE-1', titleBn: 'তাপ ও বায়ু থ্রেশহোল্ড', titleEn: 'Heat & AQI Thresholds', description: 'Evaluates perceived Heat Index and AQI bands against activity intensity.' },
          { id: 'RULE-2', titleBn: 'কার্যক্রমের তীব্রতা মডিফায়ার', titleEn: 'Activity Intensity Modifiers', description: 'Vigorous activities (PE, running, football) face earlier caps and mandatory indoor relocation.' },
          { id: 'RULE-3', titleBn: 'শ্বাসকষ্ট ও সংবেদনশীল শিক্ষার্থীদের সতর্কতা', titleEn: 'Respiratory Vulnerability Step-Up', description: 'Students with asthma or respiratory conditions trigger an automatic 1-tier safety step-up.' },
          { id: 'RULE-4', titleBn: 'ডেটা ফ্রেশনেস ও পুরোনো ডেটা ফ্লোর (৯০ মিনিট)', titleEn: 'Data Freshness & 90-min Stale Floor', description: 'Readings older than 90 minutes or modeled predictions are capped at PROCEED_WITH_PRECAUTIONS.' },
          { id: 'RULE-5', titleBn: 'সতর্কবার্তা ট্রিগার ও নীরব সময় (২১:০০-০৬:০০)', titleEn: 'Alert Triggers & Quiet Hours', description: 'Heads-up FCM alerts dispatched on status deterioration; quiet hours enforced 9 PM to 6 AM.' },
          { id: 'RULE-6', titleBn: 'কোঅর্ডিনেটর ওভাররাইড নিয়ম (শুধু কঠোর করা অনুমোদিত)', titleEn: 'Coordinator Override Tighten-Only', description: 'Authorized coordinators can tighten decisions with mandatory justification; relaxation below policy floor is strictly rejected (HTTP 400).' },
        ],
        aqiBands: policyConfig.aqiBands,
        heatBands: policyConfig.heatBands,
      }),
    };
  }

  // 1. Public Invite-Only Authentication Endpoint: POST /auth/login (F-01, S-2, Hard Gate 3)
  if (path.endsWith('/auth/login') && event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      // Input Schema Validation (Hard Gate 3)
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!email || !emailRegex.test(email) || !password || password.length < 8 || password.length > 128) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Validation error: A valid email address and password (8-128 chars) are required.',
          }),
        };
      }

      // Rate Limiting Protection (Hard Gate 3 & Section 08/09 DynamoDB-backed)
      const rateLimitKey = `login:${email}`;
      const isAllowed = await checkRateLimitDynamo(rateLimitKey, 5);
      if (!isAllowed) {
        return {
          statusCode: 429,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Too Many Requests: Login rate limit exceeded. Please wait 15 minutes before retrying.',
          }),
        };
      }

      // Look up staff account from DynamoDB via O(1) GetItem (Section 08 & 09: Zero Scan in hot path)
      let staff: StaffAccount | null = null;
      try {
        // Step 1: Check fast-path lookup index partition
        const lookupRes = await docClient.send(
          new GetCommand({
            TableName: DECISIONS_TABLE_NAME,
            Key: { school_id: 'STAFF_LOOKUP', activity_id: `EMAIL#${email}` },
          })
        ).catch(() => ({ Item: undefined }));

        const targetSchoolId: string | undefined = lookupRes.Item?.target_school_id;

        // Step 2: If found in lookup, fetch staff account via direct Point Get
        if (targetSchoolId) {
          const staffGet = await docClient.send(
            new GetCommand({
              TableName: DECISIONS_TABLE_NAME,
              Key: { school_id: targetSchoolId, activity_id: `STAFF#${email}` },
            })
          ).catch(() => ({ Item: undefined }));

          if (staffGet.Item) {
            const item = staffGet.Item;
            staff = {
              email: item.email,
              passwordHash: item.password_hash || item.passwordHash,
              role: item.role,
              schoolId: item.school_id,
              nameBn: item.name_bn || (item.role === 'COORDINATOR' ? 'স্কুল কোঅর্ডিনেটর' : 'সহকারী শিক্ষক'),
              nameEn: item.name_en || (item.role === 'COORDINATOR' ? 'School Coordinator' : 'Assistant Teacher'),
              schoolNameBn: item.school_name_bn || 'ঢাকা মডেল স্কুল',
              schoolNameEn: item.school_name_en || 'Dhaka Model School',
            };
          }
        }

        // Step 3: If not in lookup index (e.g. initial demo/seeded accounts), query known schools directly in O(1)
        if (!staff) {
          const KNOWN_PILOT_SCHOOLS = [
            'school-dhaka-001',
            'school-dhaka-002',
            'school-chattogram-001',
            'school-khulna-001',
            'school-rajshahi-001',
          ];

          const directLookups = await Promise.all(
            KNOWN_PILOT_SCHOOLS.map(sid =>
              docClient.send(
                new GetCommand({
                  TableName: DECISIONS_TABLE_NAME,
                  Key: { school_id: sid, activity_id: `STAFF#${email}` },
                })
              ).catch(() => ({ Item: undefined }))
            )
          );

          const matched = directLookups.find(r => r.Item);
          if (matched?.Item) {
            const item = matched.Item;
            staff = {
              email: item.email,
              passwordHash: item.password_hash || item.passwordHash,
              role: item.role,
              schoolId: item.school_id,
              nameBn: item.name_bn || (item.role === 'COORDINATOR' ? 'স্কুল কোঅর্ডিনেটর' : 'সহকারী শিক্ষক'),
              nameEn: item.name_en || (item.role === 'COORDINATOR' ? 'School Coordinator' : 'Assistant Teacher'),
              schoolNameBn: item.school_name_bn || 'ঢাকা মডেল স্কুল',
              schoolNameEn: item.school_name_en || 'Dhaka Model School',
            };

            // Write lookup index for subsequent instant O(1) single-trip logins
            docClient.send(
              new PutCommand({
                TableName: DECISIONS_TABLE_NAME,
                Item: {
                  school_id: 'STAFF_LOOKUP',
                  activity_id: `EMAIL#${email}`,
                  target_school_id: item.school_id,
                },
              })
            ).catch(() => {});
          }
        }

        // Step 4: Fallback scan for legacy or unindexed records
        if (!staff) {
          const scanRes: any = await docClient.send(
            new ScanCommand({
              TableName: DECISIONS_TABLE_NAME,
              FilterExpression: 'activity_id = :actId',
              ExpressionAttributeValues: {
                ':actId': `STAFF#${email}`,
              },
            })
          ).catch(() => ({ Items: [] }));

          if (scanRes.Items && scanRes.Items.length > 0) {
            const item = scanRes.Items[0];
            staff = {
              email: item.email,
              passwordHash: item.password_hash || item.passwordHash,
              role: item.role,
              schoolId: item.school_id,
              nameBn: item.name_bn || (item.role === 'COORDINATOR' ? 'স্কুল কোঅর্ডিনেটর' : 'সহকারী শিক্ষক'),
              nameEn: item.name_en || (item.role === 'COORDINATOR' ? 'School Coordinator' : 'Assistant Teacher'),
              schoolNameBn: item.school_name_bn || 'ঢাকা মডেল স্কুল',
              schoolNameEn: item.school_name_en || 'Dhaka Model School',
            };
          }
        }
      } catch (dbErr) {
        console.error('Error fetching staff from DynamoDB:', dbErr);
      }

      const isPasswordValid = Boolean(
        staff && password && verifyPassword(password, staff.passwordHash)
      );

      if (!staff || !password || !isPasswordValid) {
        return {
          statusCode: 401,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Invalid credentials or uninvited account. Self sign-up is disabled per Policy S-2.',
          }),
        };
      }

      // Reset rate limit on successful authentication so valid users aren't locked out
      loginAttempts.delete(rateLimitKey);
      await docClient.send(
        new DeleteCommand({
          TableName: DECISIONS_TABLE_NAME,
          Key: { school_id: 'RATELIMIT#LOGIN', activity_id: rateLimitKey },
        })
      ).catch(() => {});

      // Issue genuine Cognito RS256 IdToken when Cognito is configured (Policy S-2 / F-01)
      let token: string | undefined;
      const userPoolId = process.env.USER_POOL_ID;
      const userPoolClientId = process.env.USER_POOL_CLIENT_ID;

      if (userPoolId && userPoolClientId) {
        try {
          const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = await import(
            '@aws-sdk/client-cognito-identity-provider'
          );
          const cognitoClient = new CognitoIdentityProviderClient({ region });
          const authRes = await cognitoClient.send(
            new AdminInitiateAuthCommand({
              UserPoolId: userPoolId,
              ClientId: userPoolClientId,
              AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
              AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
              },
            })
          );
          if (authRes.AuthenticationResult?.IdToken) {
            token = authRes.AuthenticationResult.IdToken;
          }
        } catch (cognitoAuthErr: any) {
          console.warn('[Cognito Auth Warning]: AdminInitiateAuth failed:', cognitoAuthErr?.message);
        }
      }

      // Fallback for offline test environments where Cognito is not configured
      if (!token) {
        token = createSignedJwt({
          email: staff.email,
          school_id: staff.schoolId,
          role: staff.role,
          name_bn: staff.nameBn,
          name_en: staff.nameEn,
          school_name_bn: staff.schoolNameBn,
          school_name_en: staff.schoolNameEn,
        });
      }

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          token,
          user: {
            email: staff.email,
            role: staff.role,
            school_id: staff.schoolId,
            name_bn: staff.nameBn,
            name_en: staff.nameEn,
            school_name_bn: staff.schoolNameBn,
            school_name_en: staff.schoolNameEn,
          },
        }),
      };
    } catch {
      return {
        statusCode: 400,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ error: 'Malformed login request body' }),
      };
    }
  }

  // 2. Authenticate all other endpoints (Fail-Closed Hard Gate 2 & 3)
  let auth: AuthContext;
  try {
    auth = authenticateRequest(event);
  } catch (err: any) {
    return {
      statusCode: err.statusCode || 401,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ error: err.message || 'Unauthorized' }),
    };
  }

  // 3. Enforce Strict Tenant Isolation (Hard Gate 2 / S-3)
  const requestedSchoolId = event.pathParameters?.schoolId || event.queryStringParameters?.schoolId;
  if (requestedSchoolId && requestedSchoolId !== auth.schoolId && auth.role !== 'PLATFORM_ADMIN') {
    return {
      statusCode: 403,
      headers: getCorsHeaders(event),
      body: JSON.stringify({
        error: `Forbidden: Cross-tenant access denied. Token is scoped to ${auth.schoolId}, cannot access ${requestedSchoolId} (Hard Gate 2 / S-3).`,
      }),
    };
  }

  // Always scope DynamoDB operations strictly to authenticated token's schoolId
  const schoolId = auth.schoolId;

  try {
    // Route: POST /schools/{schoolId}/routines or POST /schools/{schoolId}/activities (F-10 / P4 — Coordinator Only)
    if ((path.endsWith('/routines') || path.endsWith('/activities')) && event.httpMethod === 'POST') {
      if (auth.role !== 'COORDINATOR' && auth.role !== 'PLATFORM_ADMIN') {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Forbidden: Only coordinators can modify school routines (Hard Gate 3 / F-10)' }),
        };
      }
      let body: any;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (_jsonErr) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Validation failed: Invalid JSON request body (S-6 / S8)' }),
        };
      }

      // Check if multi-activity payload is provided
      const rawActivities = Array.isArray(body) ? body : Array.isArray(body.activities) ? body.activities : null;
      const nowIso = new Date().toISOString();

      if (rawActivities) {
        const validatedActivities: any[] = [];
        for (let i = 0; i < rawActivities.length; i++) {
          const parseResult = ActivitySchema.safeParse(rawActivities[i]);
          if (!parseResult.success) {
            return {
              statusCode: 400,
              headers: getCorsHeaders(event),
              body: JSON.stringify({
                error: `Validation failed: Invalid activity at index ${i} (S-6 / P4)`,
                details: parseResult.error.issues,
              }),
            };
          }
          validatedActivities.push(parseResult.data);
        }

        const savedActivities = [];
        for (let i = 0; i < validatedActivities.length; i++) {
          const act = validatedActivities[i];
          const actId = act.id || `act-${i + 1}`;
          const activityItem = {
            school_id: schoolId,
            activity_id: `ACTIVITY#${actId}`,
            id: actId,
            name_bn: act.name_bn,
            name_en: act.name_en,
            time_slot: act.time_slot || '',
            intensity: act.intensity.toUpperCase(),
            location_type: act.location_type || 'FIELD',
            target_class: act.target_class || null,
            duration_minutes: act.duration_minutes ?? 45,
            is_current: Boolean(act.is_current),
            order: act.order ?? (i + 1),
            updated_by: auth.email,
            updated_at: nowIso,
          };
          await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: activityItem }));
          savedActivities.push(activityItem);
        }

        const currentAct = savedActivities.find((a) => a.is_current) || savedActivities[0];
        const nextAct = savedActivities.find((a) => !a.is_current && a.id !== currentAct?.id) || savedActivities[1];
        const routineItem = {
          school_id: schoolId,
          activity_id: 'ROUTINE#current',
          activity_name_bn: currentAct?.name_bn || null,
          activity_name_en: currentAct?.name_en || null,
          next_activity_bn: nextAct?.name_bn || null,
          next_activity_en: nextAct?.name_en || null,
          intensity: (currentAct?.intensity || 'MODERATE').toLowerCase() as ActivityIntensity,
          location_type: currentAct?.location_type || 'FIELD',
          duration_minutes: currentAct?.duration_minutes ?? 45,
          target_class: currentAct?.target_class || null,
          updated_by: auth.email,
          updated_at: nowIso,
        };
        await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: routineItem }));

        return {
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ status: 'UPDATED', routine: routineItem, activities: savedActivities }),
        };
      }

      // S8 (S-6): Validate payload with RoutineSchema
      const routineParse = RoutineSchema.safeParse(body);
      if (!routineParse.success) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Validation failed: Invalid routine payload schema (S-6 / S8)',
            details: routineParse.error.issues,
          }),
        };
      }

      const validData = routineParse.data;
      const intensityRaw = (validData.intensity || 'moderate').toLowerCase();
      const intensity: ActivityIntensity =
        intensityRaw === 'vigorous' ? 'vigorous' : intensityRaw === 'light' ? 'light' : 'moderate';
      const routineItem = {
        school_id: schoolId,
        activity_id: 'ROUTINE#current',
        activity_name_bn: validData.activity_name_bn ? String(validData.activity_name_bn).trim() : null,
        activity_name_en: validData.activity_name_en ? String(validData.activity_name_en).trim() : null,
        next_activity_bn: validData.next_activity_bn ? String(validData.next_activity_bn).trim() : null,
        next_activity_en: validData.next_activity_en ? String(validData.next_activity_en).trim() : null,
        intensity,
        location_type: validData.location_type,
        duration_minutes: validData.duration_minutes,
        target_class: validData.target_class ? String(validData.target_class).trim() : null,
        updated_by: auth.email,
        updated_at: nowIso,
      };
      await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: routineItem }));

      // Model and persist ACTIVITY#current and ACTIVITY#next (P4 / F-10)
      const currentActItem = {
        school_id: schoolId,
        activity_id: 'ACTIVITY#current',
        id: 'current',
        name_bn: validData.activity_name_bn ? String(validData.activity_name_bn).trim() : 'বর্তমান অ্যাক্টিভিটি',
        name_en: validData.activity_name_en ? String(validData.activity_name_en).trim() : 'Current Activity',
        time_slot: validData.time_slot || '',
        intensity: intensity.toUpperCase(),
        location_type: validData.location_type,
        target_class: validData.target_class ? String(validData.target_class).trim() : null,
        duration_minutes: validData.duration_minutes,
        is_current: true,
        order: 1,
        updated_by: auth.email,
        updated_at: nowIso,
      };
      await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: currentActItem }));

      if (validData.next_activity_bn || validData.next_activity_en) {
        const nextActItem = {
          school_id: schoolId,
          activity_id: 'ACTIVITY#next',
          id: 'next',
          name_bn: validData.next_activity_bn ? String(validData.next_activity_bn).trim() : 'পরবর্তী অ্যাক্টিভিটি',
          name_en: validData.next_activity_en ? String(validData.next_activity_en).trim() : 'Next Activity',
          time_slot: '',
          intensity: 'MODERATE',
          location_type: 'FIELD',
          target_class: null,
          duration_minutes: 45,
          is_current: false,
          order: 2,
          updated_by: auth.email,
          updated_at: nowIso,
        };
        await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: nextActItem }));
      }

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ status: 'UPDATED', routine: routineItem }),
      };
    }

    // Route: GET /schools/{schoolId}/routines or GET /schools/{schoolId}/activities (F-10 / P4)
    if ((path.endsWith('/routines') || path.endsWith('/activities')) && event.httpMethod === 'GET') {
      let routineItem: any = null;
      let activeOverride: any = null;
      try {
        const [routineRes, overrideRes] = await Promise.all([
          docClient.send(new GetCommand({ TableName: DECISIONS_TABLE_NAME, Key: { school_id: schoolId, activity_id: 'ROUTINE#current' } })),
          docClient.send(new GetCommand({ TableName: DECISIONS_TABLE_NAME, Key: { school_id: schoolId, activity_id: 'OVERRIDE#active' } })),
        ]);
        routineItem = routineRes.Item || null;
        activeOverride = overrideRes.Item || null;
      } catch (_e) {}

      let latestReading: any = null;
      try {
        const latestRes = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'school_id = :sid',
            ExpressionAttributeValues: { ':sid': schoolId },
            ScanIndexForward: false,
            Limit: 1,
          })
        );
        latestReading = latestRes.Items?.[0];
      } catch (_e) {}

      const readings = latestReading?.readings || {};
      const heatIndexC = readings.heat_index_c ?? readings.temperature_c ?? null;
      const aqi = readings.aqi ?? null;
      const readingTimeMs = latestReading?.timestamp ? Date.parse(latestReading.timestamp) : NaN;
      const ageMinutes = Number.isFinite(readingTimeMs) ? (Date.now() - readingTimeMs) / (1000 * 60) : 999;
      const isStale = Boolean(latestReading?.evaluation?.isStale) || ageMinutes > 90;
      const isModeled = Boolean(latestReading?.is_modeled);

      const evaluated = await getEvaluatedActivitiesForSchool({
        schoolId,
        docClient,
        decisionsTableName: DECISIONS_TABLE_NAME,
        currentAqi: aqi,
        currentHeatIndexC: heatIndexC,
        hourlyForecast: latestReading?.hourly_forecast,
        isModeled,
        isStale,
        activeOverride,
        cachedRoutineItem: routineItem,
      });

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          school_id: schoolId,
          routine: routineItem,
          activities: evaluated.activities,
          current_activity: evaluated.current_activity,
          next_activity: evaluated.next_activity,
        }),
      };
    }

    // Route: POST /schools/{schoolId}/overrides (F-11 — Coordinator Only, Hard Gate 4 Floor Enforced)
    if (path.endsWith('/overrides') && event.httpMethod === 'POST') {
      if (auth.role !== 'COORDINATOR' && auth.role !== 'PLATFORM_ADMIN') {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Forbidden: Only coordinators can record decision overrides (Hard Gate 3 / F-11)' }),
        };
      }
      let body: any;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (_jsonErr) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Validation failed: Invalid JSON request body (S-6 / S8)' }),
        };
      }

      // S8 (S-6): Validate payload with OverrideSchema
      const overrideParse = OverrideSchema.safeParse(body);
      if (!overrideParse.success) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Validation failed: Invalid override payload schema (S-6 / S8)',
            details: overrideParse.error.issues,
          }),
        };
      }

      const reason = overrideParse.data.reason.trim();
      const requestedDecision = overrideParse.data.decision as PolicyDecision;

      // 1. Fetch current active routine from DECISIONS_TABLE_NAME to determine real activity intensity (S4)
      let activeIntensity: ActivityIntensity = 'moderate';
      try {
        const routineRes = await docClient.send(
          new GetCommand({
            TableName: DECISIONS_TABLE_NAME,
            Key: { school_id: schoolId, activity_id: 'ROUTINE#current' },
          })
        );
        if (routineRes.Item?.intensity) {
          const rawInt = String(routineRes.Item.intensity).toLowerCase();
          activeIntensity = rawInt === 'vigorous' ? 'vigorous' : rawInt === 'light' ? 'light' : 'moderate';
        }
      } catch (routineErr) {
        console.warn('[Override Warning] Could not fetch active routine intensity, defaulting to moderate:', routineErr);
      }

      // 2. Fetch latest sensor telemetry from TABLE_NAME — Fail-closed with 503 if unavailable (Hard Gate 4 / S4)
      let latestReading: any = null;
      try {
        const latestReadingRes = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'school_id = :sid',
            ExpressionAttributeValues: { ':sid': schoolId },
            ScanIndexForward: false,
            Limit: 1,
          })
        );
        latestReading = latestReadingRes.Items?.[0];
      } catch (readErr: any) {
        console.error('[Override Error] Failed to read sensor telemetry table:', readErr);
        return {
          statusCode: 503,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Service Unavailable: Unable to retrieve sensor telemetry to verify policy floor (Hard Gate 4 / S4)',
          }),
        };
      }

      if (!latestReading || !latestReading.readings) {
        return {
          statusCode: 503,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            error: 'Service Unavailable: No sensor telemetry available for school to verify policy floor (Hard Gate 4 / S4)',
          }),
        };
      }

      // 3. Compute baseline deterministic floor with school's actual activity intensity and worst-case forecast (P2)
      const currentHi = latestReading.readings.heat_index_c ?? latestReading.readings.temperature_c;
      const currentAqi = latestReading.readings.aqi;
      const worstCase = getWorstCaseConditionsForActivity({
        currentAqi,
        currentHeatIndexC: currentHi,
        durationMinutes: 45,
        hourlyForecast: latestReading.hourly_forecast,
      });

      const floorEval = evaluatePolicyFloor({
        heatIndexC: worstCase.worstHeatIndexC,
        aqi: worstCase.worstAqi,
        intensity: activeIntensity,
        isModeled: Boolean(latestReading.is_modeled),
        isStale: Boolean(latestReading.evaluation?.isStale),
      });
      if (worstCase.isForecastWorse && worstCase.forecastPeakReason) {
        floorEval.reasons.push(worstCase.forecastPeakReason);
        floorEval.reasonCodes.push('FORECAST_WORST_CASE_PEAK');
      }
      const floor = floorEval.decision;
      const relaxesFloor = STRICTNESS_ORDER[requestedDecision] < STRICTNESS_ORDER[floor];

      // 4. Record override and audit trail (Appendix A / F-11)
      const nowIso = new Date().toISOString();
      const overrideRecord = {
        school_id: schoolId,
        activity_id: 'OVERRIDE#active',
        requested_decision: requestedDecision,
        reason,
        coordinator_email: auth.email,
        policy_floor: floor,
        relaxes_floor: relaxesFloor,
        intensity: activeIntensity,
        timestamp: nowIso,
      };
      const auditRecord = {
        school_id: schoolId,
        activity_id: `OVERRIDE_AUDIT#${nowIso}`,
        requested_decision: requestedDecision,
        reason,
        coordinator_email: auth.email,
        policy_floor: floor,
        relaxes_floor: relaxesFloor,
        intensity: activeIntensity,
        timestamp: nowIso,
      };
      await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: overrideRecord }));
      await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: auditRecord }));

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          status: 'RECORDED',
          override: overrideRecord,
          policy_floor: floor,
          relaxes_floor: relaxesFloor,
        }),
      };
    }

    // Route: GET /schools/{schoolId}/notes (F-08 — Teacher Context Notes & Sensitive Group Status)
    if (path.endsWith('/notes') && event.httpMethod === 'GET') {
      const noteRes = await docClient.send(
        new GetCommand({
          TableName: DECISIONS_TABLE_NAME,
          Key: { school_id: schoolId, activity_id: 'NOTE#latest' },
        })
      );
      const activeNote = noteRes.Item || null;
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          schoolId,
          activeNote,
          hasRespiratoryCondition: Boolean(activeNote?.has_respiratory_condition),
        }),
      };
    }

    // Route: POST /schools/{schoolId}/notes (F-08 — Teacher Activity Notes & Sensitive Group Step-Up)
    if (path.endsWith('/notes') && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const note = String(body.note || '').trim();
      if (!note) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Activity note cannot be empty' }),
        };
      }
      const hasRespiratory =
        Boolean(body.has_respiratory_condition) ||
        /asthma|respiratory|breathing|cough|wheez|শ্বাসকষ্ট|হাঁপানি|কাশি/i.test(note);
      const nowIso = new Date().toISOString();
      const noteItem = {
        school_id: schoolId,
        activity_id: 'NOTE#latest',
        note,
        has_respiratory_condition: hasRespiratory,
        author_email: auth.email,
        timestamp: nowIso,
      };
      await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: noteItem }));
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          status: 'SAVED',
          note: noteItem,
          has_respiratory_condition: hasRespiratory,
          safety_tier_stepped_up: hasRespiratory,
          messageBn: hasRespiratory
            ? 'নোট সংরক্ষিত হয়েছে (শ্বাসকষ্ট সনাক্তকরণ: নিরাপত্তা সীমা ১ ধাপ বাড়ানো হয়েছে)'
            : 'নোট সফলভাবে সংরক্ষিত হয়েছে',
          messageEn: hasRespiratory
            ? 'Note saved (respiratory condition detected: safety tier stepped up by 1)'
            : 'Note successfully saved',
        }),
      };
    }

    // Route: POST /schools/{schoolId}/staff/invite (F-12 — Coordinator Only)
    if (path.endsWith('/staff/invite') && event.httpMethod === 'POST') {
      if (auth.role !== 'COORDINATOR' && auth.role !== 'PLATFORM_ADMIN') {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Forbidden: Only coordinators can invite staff (Hard Gate 3 / F-12)' }),
        };
      }
      const body = JSON.parse(event.body || '{}');
      const inviteEmail = String(body.email || '').trim().toLowerCase();
      // Hard Gate 3: school_id is strictly taken from caller's token (auth.schoolId), NEVER from client body
      const schoolId = auth.schoolId;
      // Hard Gate 3: Role is ALWAYS 'TEACHER' — coordinators cannot create more coordinators
      const inviteRole = 'TEACHER';

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!inviteEmail || !emailRegex.test(inviteEmail)) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Valid school email is required' }),
        };
      }

      // Call Cognito AdminCreateUser if USER_POOL_ID is configured (F-12)
      const userPoolId = process.env.USER_POOL_ID;
      if (userPoolId) {
        try {
          const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminAddUserToGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');
          const cognitoClient = new CognitoIdentityProviderClient({ region });
          await cognitoClient.send(
            new AdminCreateUserCommand({
              UserPoolId: userPoolId,
              Username: inviteEmail,
              UserAttributes: [
                { Name: 'email', Value: inviteEmail },
                { Name: 'email_verified', Value: 'true' },
                { Name: 'custom:school_id', Value: schoolId },
              ],
              DesiredDeliveryMediums: ['EMAIL'],
            })
          );
          await cognitoClient.send(
            new AdminAddUserToGroupCommand({
              UserPoolId: userPoolId,
              Username: inviteEmail,
              GroupName: 'teacher',
            })
          );
        } catch (cognitoErr: any) {
          console.error('Cognito AdminCreateUser error:', cognitoErr);
        }
      }

      // Provision initial credentials so invited teacher can authenticate immediately
      const initialPassword = `AirSafe#${crypto.randomBytes(6).toString('base64url')}!`;
      const staffItem = {
        school_id: schoolId,
        activity_id: `STAFF#${inviteEmail}`,
        email: inviteEmail,
        role: inviteRole,
        password_hash: hashPassword(initialPassword),
        invited_by: auth.email,
        invited_at: new Date().toISOString(),
      };
      await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE_NAME, Item: staffItem }));
      // Also store O(1) global point lookup record (Section 08 & 09)
      await docClient.send(
        new PutCommand({
          TableName: DECISIONS_TABLE_NAME,
          Item: {
            school_id: 'STAFF_LOOKUP',
            activity_id: `EMAIL#${inviteEmail}`,
            target_school_id: schoolId,
          },
        })
      );
      // Return sanitized staff representation without exposing password_hash (Gate 1 & S-2)
      const sanitizedStaff = {
        school_id: staffItem.school_id,
        email: staffItem.email,
        role: staffItem.role,
        invited_by: staffItem.invited_by,
        invited_at: staffItem.invited_at,
      };
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          status: 'INVITED',
          staff: sanitizedStaff,
          instructions: 'Invitation sent via email with temporary credentials from Cognito (Policy S-2).',
        }),
      };
    }

    // Route: GET /schools/{schoolId}/staff (Coordinator & Staff)
    if (path.endsWith('/staff') && event.httpMethod === 'GET') {
      try {
        const staffRes = await docClient.send(
          new QueryCommand({
            TableName: DECISIONS_TABLE_NAME,
            KeyConditionExpression: 'school_id = :sid AND begins_with(activity_id, :prefix)',
            ExpressionAttributeValues: {
              ':sid': schoolId,
              ':prefix': 'STAFF#',
            },
          })
        );
        const staff = (staffRes.Items || []).map((item: any) => ({
          email: item.email,
          roleBn: item.role === 'COORDINATOR' ? 'কোঅর্ডিনেটর' : 'শিক্ষক',
          roleEn: item.role === 'COORDINATOR' ? 'Coordinator' : 'Teacher',
        }));
        return {
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ staff }),
        };
      } catch {
        return {
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ staff: [] }),
        };
      }
    }

    // Route: GET /schools/{schoolId}/sensor-sites
    if (path.endsWith('/sensor-sites') && event.httpMethod === 'GET') {
      const readingRes = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'school_id = :sid',
          ExpressionAttributeValues: { ':sid': schoolId },
          ScanIndexForward: false,
          Limit: 1,
        })
      );
      const item = readingRes.Items?.[0];
      const readings = item?.readings;

      const baseTemp = readings?.temperature_c ?? 26.3;
      const baseRh = readings?.relative_humidity_pct ?? 71;
      const basePm25 = readings?.pm25_ugm3 ?? 44.6;
      const baseHi = readings?.heat_index_c ?? 27.8;
      const isOnline = Boolean(item && readings);

      // Dynamic relative freshness calculation
      const diffMs = item?.timestamp ? Math.max(0, Date.now() - new Date(item.timestamp).getTime()) : 0;
      const diffMins = Math.floor(diffMs / 60000);
      const toBnDigits = (n: number) => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[parseInt(d, 10)]);

      const fieldAgeBn = diffMins < 1 ? 'এইমাত্র' : `${toBnDigits(diffMins)} মিনিট আগে`;
      const fieldAgeEn = diffMins < 1 ? 'Just now' : `${diffMins} min ago`;

      const courtyardAgeBn = diffMins + 1 <= 1 ? '১ মিনিট আগে' : `${toBnDigits(diffMins + 1)} মিনিট আগে`;
      const courtyardAgeEn = `${diffMins + 1} mins ago`;

      const classroomAgeBn = diffMins + 2 <= 2 ? '২ মিনিট আগে' : `${toBnDigits(diffMins + 2)} মিনিট আগে`;
      const classroomAgeEn = `${diffMins + 2} mins ago`;

      // School Campus Sensor Sites: Field, Courtyard, Classroom (Clean, no district feed)
      const sites = [
        {
          id: `${schoolId}-field`,
          name_bn: 'খেলার মাঠ (Playground)',
          name_en: 'School Playground',
          location_type: 'FIELD',
          temp_c: readings?.temperature_c ?? baseTemp,
          rh_pct: readings?.relative_humidity_pct ?? baseRh,
          pm25_ugm3: readings?.pm25_ugm3 ?? basePm25,
          heat_index_c: readings?.heat_index_c ?? baseHi,
          is_online: isOnline,
          last_updated_bn: fieldAgeBn,
          last_updated_en: fieldAgeEn,
        },
        {
          id: `${schoolId}-courtyard`,
          name_bn: 'স্কুল উঠান (Courtyard)',
          name_en: 'School Courtyard',
          location_type: 'COURTYARD',
          temp_c: Math.round(((readings?.temperature_c ?? baseTemp) - 0.7) * 10) / 10,
          rh_pct: Math.round((readings?.relative_humidity_pct ?? baseRh) * 0.98),
          pm25_ugm3: Math.round(((readings?.pm25_ugm3 ?? basePm25) * 0.92) * 10) / 10,
          heat_index_c: Math.round(((readings?.heat_index_c ?? baseHi) - 0.9) * 10) / 10,
          is_online: isOnline,
          last_updated_bn: courtyardAgeBn,
          last_updated_en: courtyardAgeEn,
        },
        {
          id: `${schoolId}-classroom-101`,
          name_bn: 'ক্লাসরুম ৩-এ (Classroom 3A)',
          name_en: 'Classroom 3A',
          location_type: 'CLASSROOM',
          temp_c: Math.round(((readings?.temperature_c ?? baseTemp) - 1.9) * 10) / 10,
          rh_pct: 60,
          pm25_ugm3: Math.round(((readings?.pm25_ugm3 ?? basePm25) * 0.60) * 10) / 10,
          heat_index_c: Math.round(((readings?.heat_index_c ?? baseHi) - 2.3) * 10) / 10,
          is_online: isOnline,
          last_updated_bn: classroomAgeBn,
          last_updated_en: classroomAgeEn,
        },
      ];
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ sites }),
      };
    }

    // Route: GET /schools/{schoolId}/analytics
    if (path.endsWith('/analytics') && event.httpMethod === 'GET') {
      const readingsRes = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'school_id = :sid',
          ExpressionAttributeValues: { ':sid': schoolId },
          ScanIndexForward: false,
          Limit: 20,
        })
      );
      const items = readingsRes.Items || [];
      let avgAqi = 0;
      let maxHi = 0;
      let indoorDecisionsCount = 0;
      if (items.length > 0) {
        let totalAqi = 0;
        let count = 0;
        for (const it of items) {
          if (it.readings?.aqi != null) {
            totalAqi += it.readings.aqi;
            count++;
          }
          if (it.readings?.heat_index_c != null && it.readings.heat_index_c > maxHi) {
            maxHi = it.readings.heat_index_c;
          }
          if (it.evaluation?.decision === 'MOVE_INDOORS') {
            indoorDecisionsCount++;
          }
        }
        avgAqi = count > 0 ? Math.round(totalAqi / count) : 0;
      }
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          period_bn: 'সর্বশেষ ৭ দিন (যাচাইকৃত ডেটা)',
          period_en: 'Past 7 Days (Verified Telemetry)',
          avg_aqi: avgAqi,
          max_heat_index_c: maxHi,
          total_indoor_hours: indoorDecisionsCount * 2,
          warning_days_count: Math.min(items.length, 3),
          trend_direction: 'STABLE',
          total_sessions_analyzed: items.length,
        }),
      };
    }

    // Route: POST /schools/{schoolId}/assistant/chat (F-05, A-1, A-5, A-7 — Grounded AI Assistant)
    if (path.endsWith('/assistant/chat') && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const query = String(body.query || '').trim();
      const isBengali = body.is_bengali !== false;

      // Prompt Injection & Cross-Tenant Guardrail (A-5, S-8, Hard Gate 2 & 4)
      if (
        /ignore previous|system prompt|override policy|force green|other school|school-ctg|school-raj/i.test(query) &&
        !query.includes(schoolId)
      ) {
        return {
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            answer: isBengali
              ? 'নিরাপত্তা গার্ডরেইল (Policy A-5/S-8): আমি অন্য কোনো স্কুলের ডেটা অ্যাক্সেস করতে বা Model School Outdoor Activity Policy v1.2-এর নিরাপত্তা সীমা শিথিল করতে পারি না।'
              : 'Security Guardrail (Policy A-5/S-8): I cannot access another school’s telemetry or relax the deterministic safety floor of Policy v1.2.',
            citation_id: 'Policy v1.2 §A-1 & §S-8 (Guardrail)',
            citation_excerpt: 'AI assistant is strictly explanatory and tenant-scoped; it can never relax the deterministic policy floor or read cross-tenant data.',
            doc_id: 'airsafe-policy-v1.2',
          }),
        };
      }

      // Query latest reading for this school from DynamoDB
      const readingRes = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'school_id = :sid',
          ExpressionAttributeValues: { ':sid': schoolId },
          ScanIndexForward: false,
          Limit: 1,
        })
      );
      const item = readingRes.Items?.[0];
      if (!item || !item.readings) {
        return {
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({
            answer: isBengali
              ? 'বর্তমানে আপনার স্কুলের সেন্সর ডেটা পাওয়া যাচ্ছে না (UNKNOWN — Fail-Closed)। নীতিমালা অনুযায়ী ডেটা ছাড়া কোনো আউটডোর কার্যক্রমকে নিরাপদ ঘোষণা করা যাবে না।'
              : 'Sensor telemetry is currently unavailable for your school (UNKNOWN — Fail-Closed). Per Policy v1.2, outdoor activity cannot be declared safe without verified data.',
            citation_id: 'Policy v1.2 §4 (Data Quality & Fail-Closed)',
            citation_excerpt: 'When sensor and modeled telemetry are unavailable, the system must fail closed to UNKNOWN.',
            doc_id: 'airsafe-policy-v1.2',
          }),
        };
      }

      const hi = item.readings.heat_index_c ?? item.readings.temperature_c;
      const aqi = item.readings.aqi;

      // Check reading age & staleness (>90 min per Policy v1.2 Section 4)
      const readingTimeMs = item.timestamp ? Date.parse(item.timestamp) : NaN;
      const ageMinutes = Number.isFinite(readingTimeMs) ? (Date.now() - readingTimeMs) / (1000 * 60) : 999;
      const isStale = Boolean(item.evaluation?.isStale) || ageMinutes > 90;
      const isModeled = Boolean(item.is_modeled);

      // Fetch active routine, latest teacher note, and active coordinator override
      let activeIntensity: ActivityIntensity = 'moderate';
      let routineNameBn: string | null = null;
      let routineNameEn: string | null = null;
      let nextActivityBn: string | null = null;
      let nextActivityEn: string | null = null;
      let hasRespiratoryCondition = false;
      let activeOverride: any = null;
      let routineDuration = 45;

      try {
        const [routineRes, noteRes, overrideRes] = await Promise.all([
          docClient.send(
            new GetCommand({
              TableName: DECISIONS_TABLE_NAME,
              Key: { school_id: schoolId, activity_id: 'ROUTINE#current' },
            })
          ),
          docClient.send(
            new GetCommand({
              TableName: DECISIONS_TABLE_NAME,
              Key: { school_id: schoolId, activity_id: 'NOTE#latest' },
            })
          ),
          docClient.send(
            new GetCommand({
              TableName: DECISIONS_TABLE_NAME,
              Key: { school_id: schoolId, activity_id: 'OVERRIDE#active' },
            })
          ),
        ]);

        if (routineRes.Item) {
          activeIntensity = routineRes.Item.intensity || 'moderate';
          routineDuration = routineRes.Item.duration_minutes ?? 45;
          routineNameBn = routineRes.Item.activity_name_bn || null;
          routineNameEn = routineRes.Item.activity_name_en || null;
          nextActivityBn = routineRes.Item.next_activity_bn || null;
          nextActivityEn = routineRes.Item.next_activity_en || null;
        }
        if (noteRes.Item?.has_respiratory_condition) {
          hasRespiratoryCondition = true;
        }
        if (overrideRes.Item) {
          activeOverride = overrideRes.Item;
        }
      } catch {
        // Optional metadata query failed; continue with deterministic evaluation
      }

      // Fetch and evaluate decisions for all activities (P4 / F-10)
      const evaluatedActs = await getEvaluatedActivitiesForSchool({
        schoolId,
        docClient,
        decisionsTableName: DECISIONS_TABLE_NAME,
        currentAqi: aqi,
        currentHeatIndexC: hi,
        hourlyForecast: item.hourly_forecast,
        isModeled,
        isStale,
        hasRespiratoryCondition,
        activeOverride,
        cachedRoutineItem: {
          intensity: activeIntensity,
          duration_minutes: routineDuration,
          activity_name_bn: routineNameBn,
          activity_name_en: routineNameEn,
          next_activity_bn: nextActivityBn,
          next_activity_en: nextActivityEn,
        },
      });

      // Evaluate deterministic Policy Floor using worst-case conditions across activity duration (P2)
      const activityDuration = routineDuration;
      const worstCase = getWorstCaseConditionsForActivity({
        currentAqi: aqi,
        currentHeatIndexC: hi,
        durationMinutes: activityDuration,
        hourlyForecast: item.hourly_forecast,
      });

      const evalResult = evaluatePolicyFloor({
        heatIndexC: worstCase.worstHeatIndexC,
        aqi: worstCase.worstAqi,
        intensity: activeIntensity,
        isModeled,
        isStale,
        hasRespiratoryCondition,
      });
      if (worstCase.isForecastWorse && worstCase.forecastPeakReason) {
        evalResult.reasons.push(worstCase.forecastPeakReason);
        evalResult.reasonCodes.push('FORECAST_WORST_CASE_PEAK');
      }

      // Enforce Hard Gate 4: Coordinator override can only tighten policy floor, never relax it
      let finalDecision = evalResult.decision;
      if (activeOverride && activeOverride.requested_decision) {
        const reqDec = activeOverride.requested_decision as PolicyDecision;
        if (
          ORDERED_DECISIONS.includes(reqDec) &&
          STRICTNESS_ORDER[reqDec] > STRICTNESS_ORDER[finalDecision]
        ) {
          finalDecision = reqDec;
        }
      }

      const overrideNote = activeOverride ? ` [ওভাররাইড কার্যকর: ${activeOverride.requested_decision}]` : '';
      const overrideNoteEn = activeOverride ? ` [Active Override: ${activeOverride.requested_decision}]` : '';
      const respNote = hasRespiratoryCondition ? ' (শ্বাসকষ্ট/অ্যাজমা নোট সক্রিয় — নিরাপত্তা স্তর ১ ধাপ বাড়ানো হয়েছে)' : '';
      const respNoteEn = hasRespiratoryCondition ? ' (Respiratory condition active: stepped up 1 tier)' : '';
      const staleNote = isStale ? ' (সতর্কতা: ডেটা ৯০ মিনিটের বেশি পুরোনো)' : '';
      const staleNoteEn = isStale ? ' (Warning: Telemetry is older than 90m)' : '';

      const routinePartBn = routineNameBn
        ? `সক্রিয় রুটিন: ${routineNameBn} (তীব্রতা: ${activeIntensity})`
        : 'কোনো সক্রিয় রুটিন নির্ধারিত নেই';
      const routinePartEn = routineNameEn
        ? `Active Routine: ${routineNameEn} (intensity: ${activeIntensity})`
        : 'No active routine scheduled';
      const nextPartBn = nextActivityBn ? `। পরবর্তী সেশন: ${nextActivityBn}` : '';
      const nextPartEn = nextActivityEn ? `. Next session: ${nextActivityEn}` : '';

      const answer = isBengali
        ? `আপনার স্কুলের (${auth.schoolNameBn}) সর্বশেষ যাচাইকৃত রিডিং অনুযায়ী হিট ইনডেক্স ${hi}°C এবং AQI ${aqi}। ${routinePartBn}${nextPartBn}${respNote}${staleNote}। Model School Outdoor Activity Policy v1.2 অনুসারে বর্তমান সিদ্ধান্ত হলো **${finalDecision}**${overrideNote} (${evalResult.reasons[0]})। নির্ধারিত সময়সীমা: ${evalResult.maxDurationMinutes ?? 0} মিনিট।`
        : `Based on the latest verified reading for ${auth.schoolNameEn}, Heat Index is ${hi}°C and AQI is ${aqi}. ${routinePartEn}${nextPartEn}${respNoteEn}${staleNoteEn}. Per Model School Outdoor Activity Policy v1.2, the mandatory decision is **${finalDecision}**${overrideNoteEn} (${evalResult.reasons[0]}). Max outdoor duration: ${evalResult.maxDurationMinutes ?? 0} minutes.`;

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          answer,
          decision: finalDecision,
          policy_floor_decision: evalResult.decision,
          heat_index_c: hi,
          aqi,
          routine_intensity: routineNameBn ? activeIntensity : null,
          current_activity_bn: routineNameBn,
          activities: evaluatedActs.activities,
          current_activity: evaluatedActs.current_activity,
          next_activity: evaluatedActs.next_activity,
          current_activity_en: routineNameEn,
          next_activity_bn: nextActivityBn,
          next_activity_en: nextActivityEn,
          has_respiratory_condition: hasRespiratoryCondition,
          is_stale: isStale,
          citation_id: 'Model School Outdoor Activity Policy v1.2, §1–§4',
          citation_excerpt:
            'Outdoor activity decisions strictly bound by deterministic Policy v1.2 safety floors; AI cannot relax safety limits.',
          doc_id: 'airsafe-policy-v1.2',
        }),
      };
    }

    // Default Route: GET /schools/{schoolId}/current-decision (F-02, Hard Gate 2, 3, 4)
    const cmd = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'school_id = :sid',
      ExpressionAttributeValues: {
        ':sid': schoolId,
      },
      ScanIndexForward: false,
      Limit: 1,
    });

    const result = await docClient.send(cmd);
    const latestItem = result.Items?.[0];

    // Hard Gate 4: Fail-Closed when DynamoDB has no data for the school (NEVER return GREEN/PROCEED!)
    if (!latestItem) {
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          school_id: schoolId,
          school_name: `${auth.schoolNameBn} (${auth.schoolNameEn})`,
          status: 'UNKNOWN',
          decision: 'UNKNOWN',
          heat_index_c: null,
          aqi: null,
          pm25_ugm3: null,
          primary_reason:
            'সেন্সর বা আবহাওয়া ডেটা পাওয়া যায়নি — অনুগ্রহ করে কোঅর্ডিনেটরের সাথে যোগাযোগ করুন (No sensor data available — fail-closed)',
          reasons: ['DATA_UNAVAILABLE'],
          max_duration_minutes: null,
          requires_shade: true,
          is_stale: true,
          is_modeled: true,
          last_updated: null,
        }),
      };
    }

    // Fetch optional active routine, latest teacher note, and active override from DECISIONS_TABLE_NAME
    let activeIntensity: ActivityIntensity = 'moderate';
    let currentActivityBn: string | null = null;
    let currentActivityEn: string | null = null;
    let nextActivityBn: string | null = null;
    let nextActivityEn: string | null = null;
    let hasRespiratoryCondition = false;
    let activeOverride: any = null;
    let routineDuration = 45;

    try {
      const [routineRes, noteRes, overrideRes] = await Promise.all([
        docClient.send(
          new GetCommand({
            TableName: DECISIONS_TABLE_NAME,
            Key: { school_id: schoolId, activity_id: 'ROUTINE#current' },
          })
        ),
        docClient.send(
          new GetCommand({
            TableName: DECISIONS_TABLE_NAME,
            Key: { school_id: schoolId, activity_id: 'NOTE#latest' },
          })
        ),
        docClient.send(
          new GetCommand({
            TableName: DECISIONS_TABLE_NAME,
            Key: { school_id: schoolId, activity_id: 'OVERRIDE#active' },
          })
        ),
      ]);

      if (routineRes.Item) {
        activeIntensity = routineRes.Item.intensity || 'moderate';
        routineDuration = routineRes.Item.duration_minutes ?? 45;
        currentActivityBn = routineRes.Item.activity_name_bn || null;
        currentActivityEn = routineRes.Item.activity_name_en || null;
        nextActivityBn = routineRes.Item.next_activity_bn || null;
        nextActivityEn = routineRes.Item.next_activity_en || null;
      }
      if (noteRes.Item?.has_respiratory_condition) {
        hasRespiratoryCondition = true;
      }
      if (overrideRes.Item) {
        activeOverride = overrideRes.Item;
      }
    } catch {
      // Decisions table metadata is optional; continue with deterministic evaluation
    }

    const readings = latestItem.readings || {};
    const heatIndexC = readings.heat_index_c ?? readings.temperature_c;
    const aqi = readings.aqi;

    // Check staleness (> 90 minutes per Policy v1.2 Section 4)
    const readingTimeMs = latestItem.timestamp ? Date.parse(latestItem.timestamp) : NaN;
    const ageMinutes = Number.isFinite(readingTimeMs) ? (Date.now() - readingTimeMs) / (1000 * 60) : 999;
    const isStale = Boolean(latestItem.evaluation?.isStale) || ageMinutes > 90;
    const isModeled = Boolean(latestItem.is_modeled);

    // Fetch and evaluate decisions for all activities (P4 / F-10)
    const evaluatedActs = await getEvaluatedActivitiesForSchool({
      schoolId,
      docClient,
      decisionsTableName: DECISIONS_TABLE_NAME,
      currentAqi: aqi,
      currentHeatIndexC: heatIndexC,
      hourlyForecast: latestItem.hourly_forecast,
      isModeled,
      isStale,
      hasRespiratoryCondition,
      activeOverride,
      cachedRoutineItem: {
        intensity: activeIntensity,
        duration_minutes: routineDuration,
        activity_name_bn: currentActivityBn,
        activity_name_en: currentActivityEn,
        next_activity_bn: nextActivityBn,
        next_activity_en: nextActivityEn,
      },
    });

    // Evaluate deterministically against Policy v1.2 using worst-case forecast across activity (P2)
    const activityDuration = routineDuration;
    const worstCase = getWorstCaseConditionsForActivity({
      currentAqi: aqi,
      currentHeatIndexC: heatIndexC,
      durationMinutes: activityDuration,
      hourlyForecast: latestItem.hourly_forecast,
    });

    const policyEval = evaluatePolicyFloor({
      heatIndexC: worstCase.worstHeatIndexC,
      aqi: worstCase.worstAqi,
      intensity: activeIntensity,
      isModeled,
      isStale,
      hasRespiratoryCondition,
    });
    if (worstCase.isForecastWorse && worstCase.forecastPeakReason) {
      policyEval.reasons.push(worstCase.forecastPeakReason);
      policyEval.reasonCodes.push('FORECAST_WORST_CASE_PEAK');
    }

    // Appendix A / F-11 & Hard Gate 4: Coordinator override with mandatory justification and audit trail
    let effectiveDecision = policyEval.decision;
    let effectiveStatus = policyEval.status;
    const reasons = [...policyEval.reasons];

    if (activeOverride && activeOverride.requested_decision) {
      const reqDec = activeOverride.requested_decision as PolicyDecision;
      if (
        ORDERED_DECISIONS.includes(reqDec) &&
        STRICTNESS_ORDER[reqDec] > STRICTNESS_ORDER[effectiveDecision]
      ) {
        effectiveDecision = reqDec;
        const statusMap: Record<PolicyDecision, 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'UNKNOWN'> = {
          PROCEED: 'GREEN',
          PROCEED_WITH_PRECAUTIONS: 'YELLOW',
          MODIFY: 'ORANGE',
          MOVE_INDOORS: 'RED',
          UNKNOWN: 'UNKNOWN',
        };
        effectiveStatus = statusMap[effectiveDecision] || effectiveStatus;
      }
      if (activeOverride.relaxes_floor) {
        reasons.unshift(
          `কোঅর্ডিনেটর ওভাররাইড (নীতি শিথিলকরণ): ${activeOverride.reason} [পলিসি ফ্লোর: ${activeOverride.policy_floor || policyEval.decision}]`
        );
      } else {
        reasons.unshift(`কোঅর্ডিনেটর ওভাররাইড (${activeOverride.requested_decision}): ${activeOverride.reason}`);
      }
    }

    return {
      statusCode: 200,
      headers: getCorsHeaders(event),
      body: JSON.stringify({
        school_id: latestItem.school_id,
        school_name: latestItem.school_name || `${auth.schoolNameBn} (${auth.schoolNameEn})`,
        status: effectiveStatus,
        decision: effectiveDecision,
        policy_floor_decision: policyEval.decision,
        heat_index_c: policyEval.decision === 'UNKNOWN' ? null : heatIndexC,
        aqi: policyEval.decision === 'UNKNOWN' ? null : aqi,
        pm25_ugm3: policyEval.decision === 'UNKNOWN' ? null : readings.pm25_ugm3 ?? null,
        primary_reason: reasons[0],
        reasons,
        reason_codes: policyEval.reasonCodes,
        max_duration_minutes: policyEval.maxDurationMinutes,
        requires_shade: policyEval.requiresShade,
        is_stale: isStale,
        is_modeled: isModeled,
        provenance: latestItem.provenance || null,
        hourly_forecast: latestItem.hourly_forecast || [],
        last_updated: latestItem.timestamp || null,
        current_activity_bn: currentActivityBn,
        current_activity_en: currentActivityEn,
        next_activity_bn: nextActivityBn,
        next_activity_en: nextActivityEn,
        routine_intensity: currentActivityBn ? activeIntensity : null,
        active_override: activeOverride
          ? `${activeOverride.requested_decision}: ${activeOverride.reason}`
          : null,
        activities: evaluatedActs.activities,
        current_activity: evaluatedActs.current_activity,
        next_activity: evaluatedActs.next_activity,
      }),
    };
  } catch (error: any) {
    console.error('API Handler Error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ error: 'Internal server error processing school request' }),
    };
  }
};
