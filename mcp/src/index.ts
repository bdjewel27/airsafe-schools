/**
 * AirSafe Schools - Hardened Read-Only Model Context Protocol (MCP) Server & Shared Tool Library (F-22)
 *
 * Implements MCP specification tools for LLMs (Amazon Bedrock Nova / Claude)
 * to ground queries strictly on real-time school telemetry and Policy v1.2.
 *
 * Hard Gate 2: Cryptographic Tenant Isolation (Fail-Closed)
 * - Tokens must be passed via standard HTTP Authorization / headers, NEVER tool arguments.
 * - Tool schemas do NOT contain school_id or scoped_token (scoping is purely context-driven).
 * - Full cryptographic signature verification (HMAC-SHA256), expiration, issuer, audience checks.
 * - Missing or invalid token fails closed immediately with 401/403.
 */

import * as crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SHARED_TOOL_DEFINITIONS, McpToolSchema } from './tools';

export { SHARED_TOOL_DEFINITIONS, McpToolSchema } from './tools';

export const MCP_SERVER_INFO = {
  name: 'airsafe-mcp-server',
  version: '1.2.0',
  protocolVersion: '2024-11-05'
};

export const MCP_TOOLS: McpToolSchema[] = SHARED_TOOL_DEFINITIONS;

export interface RequestContext {
  schoolId: string;
  role?: string;
  tokenExp?: number;
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class AirSafeMcpServer {
  private jwtSecret: string;
  private docClient?: DynamoDBDocumentClient;
  private tableName: string;

  constructor(options?: { jwtSecret?: string; dynamoClient?: DynamoDBDocumentClient; tableName?: string }) {
    const secret = options?.jwtSecret || process.env.MCP_JWT_SECRET;
    if (!secret || secret.trim() === '') {
      throw new Error('SECURITY FATAL: MCP_JWT_SECRET is missing in environment or options. Fail-closed (Hard Gate 1).');
    }
    this.jwtSecret = secret;
    this.tableName = options?.tableName || process.env.TABLE_NAME || 'AirSafe-Readings-dev';

    if (options?.dynamoClient) {
      this.docClient = options.dynamoClient;
    } else {
      try {
        const client = new DynamoDBClient({
          region: process.env.AWS_REGION || 'ap-southeast-2'
        });
        this.docClient = DynamoDBDocumentClient.from(client);
      } catch {
        // DynamoDB client initialized lazily
      }
    }
  }

  /**
   * Helper to mint valid test JWT tokens for testing & internal orchestration
   */
  public createToken(payload: { school_id: string; role?: string; iat?: number; exp?: number; iss?: string; aud?: string }): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const fullPayload = {
      iss: payload.iss || 'airsafe-chat',
      aud: payload.aud || 'airsafe-mcp',
      iat: payload.iat ?? now,
      exp: payload.exp ?? (now + 300), // 5 min default
      ...payload
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(dataToSign)
      .digest('base64url');

    return `${dataToSign}.${signature}`;
  }

  /**
   * Hard Gate 2: Fail-Closed Cryptographic Authentication from HTTP Headers
   */
  public authenticate(headers: Record<string, string | undefined>): RequestContext {
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (!authHeader) {
      throw new HttpError(401, 'Unauthorized: Missing Authorization header (Bearer token required)');
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new HttpError(401, 'Unauthorized: Malformed Authorization header. Expected "Bearer <token>"');
    }

    const rawToken = match[1].trim();
    const parts = rawToken.split('.');
    if (parts.length !== 3) {
      throw new HttpError(401, 'Unauthorized: Malformed JWT. Must contain header, payload, and signature');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    // Cryptographic signature check
    const expectedSignature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(dataToSign)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new HttpError(401, 'Unauthorized: Invalid token signature');
    }

    // Decode & validate claims
    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new HttpError(401, 'Unauthorized: Invalid JSON payload in token');
    }

    const now = Math.floor(Date.now() / 1000);

    // Mandatory exp check (Fail-Closed, Hard Gate 2)
    if (typeof payload.exp !== 'number') {
      throw new HttpError(401, 'Unauthorized: Missing required exp claim in token');
    }
    if (payload.exp < now) {
      throw new HttpError(401, `Unauthorized: Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
    }

    // Mandatory iat check (Fail-Closed, Hard Gate 2)
    if (typeof payload.iat !== 'number') {
      throw new HttpError(401, 'Unauthorized: Missing required iat claim in token');
    }
    if (payload.iat > now + 30) {
      throw new HttpError(401, 'Unauthorized: Token iat timestamp is in the future');
    }

    // Mandatory short-lived check: maximum 5 minutes (300 seconds per Section A-6)
    if (payload.exp - payload.iat > 300) {
      throw new HttpError(401, 'Unauthorized: Token lifetime exceeds maximum allowed 5 minutes (300s)');
    }

    // Mandatory Issuer & Audience check (Strictly scoped to Chat Lambda)
    if (payload.iss !== 'airsafe-chat') {
      throw new HttpError(401, 'Unauthorized: Invalid token issuer. Only Chat Lambda may issue MCP tokens');
    }
    if (payload.aud !== 'airsafe-mcp') {
      throw new HttpError(401, 'Unauthorized: Invalid token audience. Expected "airsafe-mcp"');
    }

    // Tenant Isolation Claim Check (Single source of truth)
    if (!payload.school_id || typeof payload.school_id !== 'string' || payload.school_id.trim() === '') {
      throw new HttpError(403, 'Forbidden: Token is missing a valid school_id claim');
    }

    return {
      schoolId: payload.school_id.trim(),
      role: payload.role,
      tokenExp: payload.exp
    };
  }

  /**
   * Tool execution with strictly enforced RequestContext scoping
   */
  public async handleToolCall(name: string, args: Record<string, any> = {}, ctx: RequestContext): Promise<any> {
    const schoolId = ctx.schoolId;

    switch (name) {
      case 'get_school_decision': {
        if (this.docClient) {
          try {
            const result = await this.docClient.send(
              new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: 'school_id = :sid',
                ExpressionAttributeValues: { ':sid': schoolId },
                ScanIndexForward: false,
                Limit: 1
              })
            );

            if (result.Items && result.Items.length > 0) {
              const item = result.Items[0];
              const decision = item.evaluation?.decision || 'UNKNOWN';
              const status = decision === 'MOVE_INDOORS'
                ? 'RED'
                : decision === 'MODIFY'
                ? 'ORANGE'
                : decision === 'PROCEED_WITH_PRECAUTIONS'
                ? 'YELLOW'
                : decision === 'PROCEED'
                ? 'GREEN'
                : 'UNKNOWN';

              return {
                available: true,
                school_id: schoolId,
                school_name: item.school_name || schoolId,
                status,
                decision,
                heat_index_c: item.readings?.heat_index_c,
                aqi: item.readings?.aqi,
                pm25_ugm3: item.readings?.pm25_ugm3,
                primary_reasons: item.evaluation?.reasons || [],
                reason_codes: item.evaluation?.reasonCodes || [],
                requires_shade: item.evaluation?.requiresShade ?? false,
                max_duration_minutes: item.evaluation?.maxDurationMinutes,
                data_source: item.source || (item.is_modeled ? 'Modeled Forecast' : 'Station Sensor'),
                is_stale: item.evaluation?.isStale ?? false,
                is_modeled: item.is_modeled ?? false,
                last_updated: item.timestamp
              };
            }
          } catch {
            // Fallthrough to fail-closed response
          }
        }

        return {
          available: false,
          school_id: schoolId,
          status: 'UNKNOWN',
          decision: 'UNKNOWN',
          message: `No real-time decision recorded for school "${schoolId}".`,
          last_updated: null
        };
      }

      case 'get_sensor_readings':
      case 'get_sensor_sites': {
        if (this.docClient) {
          try {
            const result = await this.docClient.send(
              new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: 'school_id = :sid',
                ExpressionAttributeValues: { ':sid': schoolId },
                ScanIndexForward: false,
                Limit: 1
              })
            );

            if (result.Items && result.Items.length > 0) {
              const item = result.Items[0];
              const sites = [
                {
                  site_id: `${schoolId}-field`,
                  name: 'Playground Field Sensor',
                  location_type: 'FIELD',
                  temperature_c: item.readings?.temperature_c,
                  humidity_pct: item.readings?.relative_humidity_pct,
                  heat_index_c: item.readings?.heat_index_c,
                  pm25_ugm3: item.readings?.pm25_ugm3,
                  aqi: item.readings?.aqi,
                  status: 'ONLINE',
                  timestamp: item.timestamp
                }
              ];

              if (args.location_type) {
                return sites.filter(s => s.location_type === args.location_type);
              }
              return sites;
            }
          } catch {
            // Fallthrough to empty list
          }
        }

        return [];
      }

      case 'get_outdoor_policy':
      case 'get_school_guidelines': {
        const policyDoc = {
          policy_name: 'Model School Outdoor Activity Policy',
          version: 'v1.2',
          doc_id: 'airsafe-policy-v1.2',
          effective_date: '2026-10-01',
          authority: 'Model School Environmental Health & Safety Protocol',
          citation: 'Policy v1.2, Appendix A: Environmental Decision Matrix',
          sections: {
            AQI_THRESHOLDS: [
              { range: '0-50', level: 'Good', light: 'PROCEED', moderate: 'PROCEED', vigorous: 'PROCEED', citation: 'Table 1.1' },
              { range: '51-100', level: 'Moderate', light: 'PROCEED', moderate: 'PROCEED', vigorous: 'PROCEED_WITH_PRECAUTIONS', citation: 'Table 1.2' },
              { range: '101-150', level: 'Unhealthy for Sensitive Groups', light: 'PROCEED_WITH_PRECAUTIONS', moderate: 'PROCEED_WITH_PRECAUTIONS', vigorous: 'MODIFY (max 30m, shade required)', citation: 'Table 1.3' },
              { range: '151-200', level: 'Unhealthy', light: 'MODIFY (max 15m)', moderate: 'MODIFY (max 15m)', vigorous: 'MOVE_INDOORS', citation: 'Table 1.4' },
              { range: '201+', level: 'Very Unhealthy / Hazardous', light: 'MOVE_INDOORS', moderate: 'MOVE_INDOORS', vigorous: 'MOVE_INDOORS', citation: 'Table 1.5' }
            ],
            HEAT_THRESHOLDS: [
              { heat_index_c: '<27°C', light: 'PROCEED', moderate: 'PROCEED', vigorous: 'PROCEED', shade_required: false, citation: 'Table 2.1' },
              { heat_index_c: '27-31.9°C', light: 'PROCEED', moderate: 'PROCEED_WITH_PRECAUTIONS', vigorous: 'PROCEED_WITH_PRECAUTIONS', shade_required: false, citation: 'Table 2.2' },
              { heat_index_c: '32-38.9°C', light: 'PROCEED_WITH_PRECAUTIONS', moderate: 'MODIFY (max 30m)', vigorous: 'MODIFY (max 30m)', shade_required: true, citation: 'Table 2.3' },
              { heat_index_c: '39-50.9°C', light: 'MODIFY (max 15m)', moderate: 'MOVE_INDOORS', vigorous: 'MOVE_INDOORS', shade_required: true, citation: 'Table 2.4' },
              { heat_index_c: '>=51°C', light: 'MOVE_INDOORS', moderate: 'MOVE_INDOORS', vigorous: 'MOVE_INDOORS', shade_required: true, citation: 'Table 2.5' }
            ],
            DATA_QUALITY_CAPS: [
              { rule: 'Rule 3 (Modeled Data Cap)', description: 'Decisions relying on modeled forecast data cannot be better than PROCEED_WITH_PRECAUTIONS.', citation: 'Section 4.1' },
              { rule: 'Rule 4 (Stale Data Cap)', description: 'Sensor readings older than 90 minutes cannot be better than PROCEED_WITH_PRECAUTIONS.', citation: 'Section 4.2' }
            ],
            SENSITIVE_GROUPS: [
              { rule: 'Rule 5 (Asthma / Respiratory)', description: 'For students with active respiratory condition or asthma, AQI band must be treated as one tier higher.', citation: 'Section 5.3' }
            ]
          }
        };

        if (args.section && args.section !== 'ALL' && (policyDoc.sections as any)[args.section]) {
          return {
            policy_version: policyDoc.version,
            doc_id: policyDoc.doc_id,
            section: args.section,
            rules: (policyDoc.sections as any)[args.section],
            citation: policyDoc.citation
          };
        }

        return policyDoc;
      }

      default:
        throw new HttpError(404, `Unknown MCP tool: "${name}"`);
    }
  }

  /**
   * Complete JSON-RPC 2.0 Dispatcher (initialize, tools/list, tools/call)
   */
  public async handleJsonRpcMessage(message: any, headers: Record<string, string | undefined> = {}): Promise<any> {
    const id = message.id ?? null;

    if (!message || message.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request: missing jsonrpc 2.0 version' } };
    }

    try {
      switch (message.method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: MCP_SERVER_INFO.protocolVersion,
              serverInfo: MCP_SERVER_INFO,
              capabilities: {
                tools: { listChanged: false }
              }
            }
          };
        }

        case 'tools/list': {
          this.authenticate(headers);
          return {
            jsonrpc: '2.0',
            id,
            result: { tools: MCP_TOOLS }
          };
        }

        case 'tools/call': {
          const ctx = this.authenticate(headers);
          const params = message.params || {};
          const toolName = params.name;
          const toolArgs = params.arguments || {};

          const toolResult = await this.handleToolCall(toolName, toolArgs, ctx);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
            }
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${message.method}` }
          };
      }
    } catch (err: any) {
      if (err instanceof HttpError) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: err.statusCode === 401 ? -32001 : err.statusCode === 403 ? -32003 : -32603, message: err.message }
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message || 'Internal error' }
      };
    }
  }
}

/**
 * AWS Lambda HTTP Handler (API Gateway / Bedrock Agent MCP adapter)
 */
export const handler = async (event: any) => {
  const server = new AirSafeMcpServer();
  const headers = event.headers || {};
  let body: any;

  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    };
  }

  const response = await server.handleJsonRpcMessage(body, headers);
  const statusCode = response.error ? (response.error.code === -32001 ? 401 : response.error.code === -32003 ? 403 : 400) : 200;

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(response)
  };
};

/**
 * Automated Verification Suite (Rigorous Hard Gate 2 & MCP protocol validation)
 */
if (process.argv.includes('--test')) {
  console.log('Running AirSafe MCP Server Fail-Closed Verification (Hard Gates 1 & 2)...');
  
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${msg}`);
      failed++;
    }
  }

  // Hard Gate 1: Fail closed if MCP_JWT_SECRET is absent
  try {
    delete process.env.MCP_JWT_SECRET;
    new AirSafeMcpServer();
    assert(false, 'T0: Missing MCP_JWT_SECRET must throw fatal error');
  } catch (err: any) {
    assert(err.message.includes('MCP_JWT_SECRET is missing'), 'T0: Hard Gate 1: Missing secret throws fatal error (fail-closed)');
  }

  const testSecret = '0'.repeat(32);
  const server = new AirSafeMcpServer({ jwtSecret: testSecret });

  (async () => {
    // Test 1: Fail-Closed without Authorization Header
    try {
      server.authenticate({});
      assert(false, 'T1: Missing header must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T1: Missing header throws 401 (fail-closed)');
    }

    // Test 2: Forged Token Signature Rejection
    const fHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const fPayload = Buffer.from(JSON.stringify({ school_id: 'school-dhaka-999' })).toString('base64url');
    const forgedToken = `${fHeader}.${fPayload}.fakeSignatureHere`;
    try {
      server.authenticate({ authorization: `Bearer ${forgedToken}` });
      assert(false, 'T2: Forged signature must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T2: Forged signature rejected with 401');
    }

    // Test 3: Token with missing school_id claim
    const tokenNoSchool = server.createToken({ school_id: '' });
    try {
      server.authenticate({ authorization: `Bearer ${tokenNoSchool}` });
      assert(false, 'T3: Token without school_id must throw 403');
    } catch (e: any) {
      assert(e.statusCode === 403, 'T3: Missing school_id rejected with 403');
    }

    // Test 4: Expired Token Rejection
    const expiredToken = server.createToken({ school_id: 'school-dhaka-001', exp: Math.floor(Date.now() / 1000) - 60 });
    try {
      server.authenticate({ authorization: `Bearer ${expiredToken}` });
      assert(false, 'T4: Expired token must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T4: Expired token rejected with 401');
    }

    // Test 4.1: Token missing exp claim must throw 401
    const tokenNoExp = server.createToken({ school_id: 'school-dhaka-001', exp: undefined as any });
    const partsNoExp = tokenNoExp.split('.');
    const pNoExp = JSON.parse(Buffer.from(partsNoExp[1], 'base64url').toString());
    delete pNoExp.exp;
    const bHeader = partsNoExp[0];
    const bPayload = Buffer.from(JSON.stringify(pNoExp)).toString('base64url');
    const bSig = crypto.createHmac('sha256', testSecret).update(`${bHeader}.${bPayload}`).digest('base64url');
    try {
      server.authenticate({ authorization: `Bearer ${bHeader}.${bPayload}.${bSig}` });
      assert(false, 'T4.1: Missing exp must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T4.1: Token missing exp rejected with 401');
    }

    // Test 4.2: Token with lifetime > 5 min (300s) must throw 401
    const now = Math.floor(Date.now() / 1000);
    const longToken = server.createToken({ school_id: 'school-dhaka-001', iat: now, exp: now + 3600 });
    try {
      server.authenticate({ authorization: `Bearer ${longToken}` });
      assert(false, 'T4.2: Lifetime > 5m must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T4.2: Lifetime > 5 minutes rejected with 401 (Section A-6)');
    }

    // Test 4.3: Token with invalid issuer must throw 401
    const wrongIssToken = server.createToken({ school_id: 'school-dhaka-001', iss: 'rogue-service' });
    try {
      server.authenticate({ authorization: `Bearer ${wrongIssToken}` });
      assert(false, 'T4.3: Invalid issuer must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T4.3: Invalid token issuer rejected with 401');
    }

    // Test 4.4: Token with invalid audience must throw 401
    const wrongAudToken = server.createToken({ school_id: 'school-dhaka-001', aud: 'rogue-aud' });
    try {
      server.authenticate({ authorization: `Bearer ${wrongAudToken}` });
      assert(false, 'T4.4: Invalid audience must throw 401');
    } catch (e: any) {
      assert(e.statusCode === 401, 'T4.4: Invalid token audience rejected with 401');
    }

    // Test 5: Valid Scoped Token Scoping & Tenant Isolation
    const schoolAToken = server.createToken({ school_id: 'school-dhaka-001' });
    const ctxA = server.authenticate({ authorization: `Bearer ${schoolAToken}` });
    assert(ctxA.schoolId === 'school-dhaka-001', 'T5.1: Context extracted strictly from token claim');

    // Test 6: Cross-Tenant Protection (Passing school-b in args is IGNORED, scoped strictly to school A)
    const resA = await server.handleToolCall('get_school_decision', { school_id: 'school-chittagong-002' }, ctxA);
    assert(resA.school_id === 'school-dhaka-001', 'T6: Cross-tenant arg ignored; scoped strictly to token school_id');
    assert(resA.status === 'UNKNOWN' && resA.decision === 'UNKNOWN', 'T6.1: get_school_decision returns UNKNOWN when no data exists (fail-closed)');

    // Test 7: Policy tool returns v1.2 citation and structured tables (authenticated)
    const policy = await server.handleToolCall('get_outdoor_policy', { section: 'AQI_THRESHOLDS' }, ctxA);
    assert(policy.policy_version === 'v1.2' && policy.doc_id === 'airsafe-policy-v1.2', 'T7: Policy tool returns official v1.2 citation metadata');

    // Test 8: JSON-RPC initialize
    const initRes = await server.handleJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert(initRes.result.serverInfo.name === 'airsafe-mcp-server', 'T8.1: JSON-RPC initialize succeeds');

    // Test 8.2: tools/list without token throws 401
    const listNoAuth = await server.handleJsonRpcMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert(listNoAuth.error?.code === -32001, 'T8.2: JSON-RPC tools/list without token rejected with 401');

    // Test 8.3: tools/list with token succeeds
    const listAuth = await server.handleJsonRpcMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { authorization: `Bearer ${schoolAToken}` });
    assert(listAuth.result?.tools?.length === 3, 'T8.3: JSON-RPC tools/list with valid token returns 3 tools');

    // Test 8.4: get_outdoor_policy via tools/call without token throws 401
    const policyNoAuth = await server.handleJsonRpcMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_outdoor_policy', arguments: {} }
    });
    assert(policyNoAuth.error?.code === -32001, 'T8.4: get_outdoor_policy without token rejected with 401');

    console.log(`\nMCP Verification Summary: ${passed} Passed, ${failed} Failed.`);
    if (failed > 0) process.exit(1);
  })();
}
