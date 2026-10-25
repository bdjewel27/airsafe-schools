process.env.API_JWT_SECRET = 'test-suite-secure-jwt-secret-for-jest-only-32bytes';
process.env.MCP_JWT_SECRET = 'test-suite-secure-mcp-secret-for-jest-only-32bytes';
import * as crypto from 'crypto';
import {
  handler,
  createSignedJwt,
  evaluatePolicyFloor,
  docClient,
  APIGatewayProxyEvent,
  getJwtSecret,
  getMcpJwtSecret,
  resetRateLimits,
  mintMcpTokenForChat,
  authenticateRequest,
  hashPassword,
  resetSecretsCache,
} from '../index';

describe('AirSafe API Service - Hard Gates 2, 3, 4 & Endpoints', () => {
  const teacherToken = createSignedJwt({
    email: 'fatema.teacher@dms.edu.bd',
    school_id: 'school-dhaka-001',
    role: 'TEACHER',
  });

  const coordinatorToken = createSignedJwt({
    email: 'rafiq.principal@dms.edu.bd',
    school_id: 'school-dhaka-001',
    role: 'COORDINATOR',
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  function makeEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
    return {
      httpMethod: 'GET',
      path: '/schools/school-dhaka-001/current-decision',
      resource: '/schools/{schoolId}/current-decision',
      headers: {},
      pathParameters: { schoolId: 'school-dhaka-001' },
      queryStringParameters: null,
      body: null,
      requestContext: {},
      ...overrides,
    };
  }

  test('Hard Gate 1: getJwtSecret and getMcpJwtSecret throw when environment variable and SSM are missing (Fail-Closed)', () => {
    const origApiSecret = process.env.API_JWT_SECRET;
    const origMcpSecret = process.env.MCP_JWT_SECRET;
    delete process.env.API_JWT_SECRET;
    delete process.env.MCP_JWT_SECRET;
    resetSecretsCache();
    expect(() => getJwtSecret()).toThrow(/API_JWT_SECRET is missing/);
    expect(() => getMcpJwtSecret()).toThrow(/MCP_JWT_SECRET is missing/);
    process.env.API_JWT_SECRET = origApiSecret;
    process.env.MCP_JWT_SECRET = origMcpSecret;
    resetSecretsCache();
  });

  test('returns 200 for OPTIONS preflight CORS with narrowed origin', async () => {
    const res = await handler(makeEvent({ httpMethod: 'OPTIONS', headers: { origin: 'http://localhost:3000' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
  });

  test('Hard Gate 2: Rejects unauthenticated requests with 401 (Fail-Closed)', async () => {
    const res = await handler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('Hard Gate 2: Rejects forged JWT signature with 403', async () => {
    const parts = teacherToken.split('.');
    const forgedToken = `${parts[0]}.${parts[1]}.forged_signature_123`;
    const res = await handler(makeEvent({ headers: { Authorization: `Bearer ${forgedToken}` } }));
    expect(res.statusCode).toBe(403);
  });

  test('Hard Gate 2: Rejects token with missing exp claim with 401', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ school_id: 'school-dhaka-001', role: 'TEACHER' })).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.API_JWT_SECRET!).update(`${header}.${payload}`).digest('base64url');
    const tokenNoExp = `${header}.${payload}.${sig}`;
    const res = await handler(makeEvent({ headers: { Authorization: `Bearer ${tokenNoExp}` } }));
    expect(res.statusCode).toBe(401);
  });

  test('Hard Gate 2 (S-3): Blocks cross-tenant access (school-dhaka-001 token requesting school-ctg-002)', async () => {
    const res = await handler(
      makeEvent({
        path: '/schools/school-ctg-002/current-decision',
        pathParameters: { schoolId: 'school-ctg-002' },
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toContain('Cross-tenant access denied');
  });

  test('Hard Gate 3 (F-01, S-2): Server-controlled role on login & blocks Teacher from Coordinator mutations', async () => {
    resetRateLimits();
    const testPassword = 'TestStaffPassword2026!';
    const passwordHash = hashPassword(testPassword);
    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      if (command.input?.FilterExpression?.includes('activity_id')) {
        return {
          Items: [
            {
              school_id: 'school-dhaka-001',
              activity_id: 'STAFF#fatema.teacher@dms.edu.bd',
              email: 'fatema.teacher@dms.edu.bd',
              role: 'TEACHER',
              password_hash: passwordHash,
              name_bn: 'সহকারী শিক্ষক ফাতিমা',
              name_en: 'Assistant Teacher Fatema',
              school_name_bn: 'ঢাকা মডেল স্কুল',
              school_name_en: 'Dhaka Model School',
            },
          ],
        } as never;
      }
      return {} as never;
    });

    const loginRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({
          email: 'fatema.teacher@dms.edu.bd',
          password: testPassword,
          role: 'COORDINATOR', // Ignored by server
        }),
      })
    );
    expect(loginRes.statusCode).toBe(200);
    const loginData = JSON.parse(loginRes.body);
    expect(loginData.user.role).toBe('TEACHER');
    expect(loginData.user.school_id).toBe('school-dhaka-001');

    // Wrong password test
    const failRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({
          email: 'fatema.teacher@dms.edu.bd',
          password: 'WrongPassword!',
        }),
      })
    );
    expect(failRes.statusCode).toBe(401);

    // Input schema validation (invalid email / short password)
    const schemaFailRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'short',
        }),
      })
    );
    expect(schemaFailRes.statusCode).toBe(400);

    // Rate limiting: strictly 5 attempts max for all accounts (including fatema.teacher@dms.edu.bd)
    resetRateLimits();
    for (let i = 0; i < 5; i++) {
      await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/auth/login',
          body: JSON.stringify({ email: 'fatema.teacher@dms.edu.bd', password: 'WrongPassword!' }),
        })
      );
    }
    const rateLimitRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({ email: 'fatema.teacher@dms.edu.bd', password: 'WrongPassword!' }),
      })
    );
    expect(rateLimitRes.statusCode).toBe(429);

    // Teacher blocked from POST /overrides
    const overrideRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/overrides',
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: JSON.stringify({ decision: 'MOVE_INDOORS', reason: 'Heavy dust outside' }),
      })
    );
    expect(overrideRes.statusCode).toBe(403);
  });

  test('Hard Gate 3: Cognito Authorizer claims extract role strictly from cognito:groups', () => {
    const event = makeEvent({
      requestContext: {
        authorizer: {
          claims: {
            'custom:school_id': 'school-dhaka-001',
            email: 'rafiq.principal@dms.edu.bd',
            'cognito:groups': 'coordinator,staff',
            'custom:role': 'TEACHER', // Ignored because groups say coordinator
          },
        },
      },
    });
    const auth = authenticateRequest(event);
    expect(auth.role).toBe('COORDINATOR');
    expect(auth.schoolId).toBe('school-dhaka-001');
  });

  test('Hard Gate 3 (F-12): Staff invite forces role=TEACHER and schoolId from caller token', async () => {
    let capturedItem: any = null;
    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      if (command.input?.Item?.role) {
        capturedItem = command.input.Item;
        return {} as never;
      }
      return {} as never;
    });

    const inviteRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/staff/invite',
        headers: { Authorization: `Bearer ${coordinatorToken}` },
        body: JSON.stringify({
          email: 'new.teacher@dms.edu.bd',
          role: 'COORDINATOR', // Attempt privilege escalation: must be forced to TEACHER
          school_id: 'school-chittagong-999', // Attempt spoofing school: must be caller's school
        }),
      })
    );
    expect(inviteRes.statusCode).toBe(200);
    expect(capturedItem.role).toBe('TEACHER');
    expect(capturedItem.school_id).toBe('school-dhaka-001');
    expect(JSON.parse(inviteRes.body).temporary_password).toBeUndefined();
  });

  test('Hard Gate 2: mintMcpTokenForChat produces short-lived token (<= 5m) with airsafe-chat issuer', () => {
    const token = mintMcpTokenForChat('school-dhaka-001', 'TEACHER');
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(payload.iss).toBe('airsafe-chat');
    expect(payload.aud).toBe('airsafe-mcp');
    expect(payload.school_id).toBe('school-dhaka-001');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(300);
  });

  test('Hard Gate 4: Fails closed to UNKNOWN (never GREEN/PROCEED) when DynamoDB has no reading', async () => {
    jest.spyOn(docClient, 'send').mockResolvedValueOnce({ Items: [] } as never);

    const res = await handler(
      makeEvent({
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('UNKNOWN');
    expect(body.decision).toBe('UNKNOWN');
    expect(body.heat_index_c).toBeNull();
    expect(body.aqi).toBeNull();
  });

  test('Hard Gate 4: Coordinator override can NEVER relax Policy v1.2 floor (e.g. MOVE_INDOORS cannot become PROCEED)', async () => {
    jest
      .spyOn(docClient, 'send')
      .mockResolvedValueOnce({
        Items: [
          {
            school_id: 'school-dhaka-001',
            school_name: 'Dhaka Model School',
            timestamp: new Date().toISOString(),
            is_modeled: false,
            readings: { heat_index_c: 40.5, aqi: 160, pm25_ugm3: 75.0 },
          },
        ],
      } as never)
      .mockResolvedValueOnce({ Item: { intensity: 'moderate' } } as never)
      .mockResolvedValueOnce({ Item: null } as never)
      .mockResolvedValueOnce({
        Item: { requested_decision: 'PROCEED', reason: 'Annual sports day finals' },
      } as never);

    const res = await handler(
      makeEvent({
        headers: { Authorization: `Bearer ${coordinatorToken}` },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.policy_floor_decision).toBe('MOVE_INDOORS');
    expect(body.decision).toBe('MOVE_INDOORS');
    expect(body.status).toBe('RED');
  });

  test('Policy v1.2 Evaluator: Heat Index 34°C moderate intensity returns MODIFY (ORANGE) with shade required', () => {
    const res = evaluatePolicyFloor({
      heatIndexC: 34.0,
      aqi: 60,
      intensity: 'moderate',
      isModeled: false,
      isStale: false,
      hasRespiratoryCondition: false,
    });
    expect(res.decision).toBe('MODIFY');
    expect(res.status).toBe('ORANGE');
    expect(res.requiresShade).toBe(true);
    expect(res.maxDurationMinutes).toBe(30);
  });

  test('Hard Gate 4 (F-05): /assistant/chat uses routine intensity, teacher notes, and reading age', async () => {
    // Mock DynamoDB responses:
    // 1. reading query
    // 2. routine item (intensity: vigorous)
    // 3. teacher note (has_respiratory_condition: true)
    // 4. override item (null)
    const oldTimestamp = new Date(Date.now() - 120 * 60 * 1000).toISOString(); // 120 minutes ago -> isStale = true
    jest
      .spyOn(docClient, 'send')
      .mockResolvedValueOnce({
        Items: [
          {
            school_id: 'school-dhaka-001',
            school_name: 'Dhaka Model School',
            timestamp: oldTimestamp,
            is_modeled: false,
            readings: { heat_index_c: 30.0, aqi: 80, pm25_ugm3: 25.0 },
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        Item: { activity_id: 'ROUTINE#current', intensity: 'vigorous', activity_name_bn: 'বিকেলের ফুটবল' },
      } as never)
      .mockResolvedValueOnce({
        Item: { activity_id: 'NOTE#latest', has_respiratory_condition: true, note: '২ জন ছাত্রের অ্যাজমা আছে' },
      } as never)
      .mockResolvedValueOnce({ Item: null } as never);

    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/assistant/chat',
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: JSON.stringify({ query: 'বাইরে খেলা যাবে?' }),
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.routine_intensity).toBe('vigorous');
    expect(body.has_respiratory_condition).toBe(true);
    expect(body.is_stale).toBe(true);
    // Base aqi 80 (tier 51-100) stepped up to tier 101-150 due to respiratory note, vigorous -> MODIFY
    expect(body.decision).toBe('MODIFY');
    expect(body.answer).toContain('বিকেলের ফুটবল');
    expect(body.answer).toContain('vigorous');
    expect(body.answer).toContain('শ্বাসকষ্ট');
  });

  test('GET /schools/{schoolId}/staff returns real staff directory from DynamoDB', async () => {
    jest.spyOn(docClient, 'send').mockResolvedValueOnce({
      Items: [
        { email: 'teacher1@dms.edu.bd', role: 'TEACHER' },
        { email: 'coord1@dms.edu.bd', role: 'COORDINATOR' },
      ],
    } as never);

    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/schools/school-dhaka-001/staff',
        headers: { Authorization: `Bearer ${coordinatorToken}` },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.staff).toHaveLength(2);
    expect(body.staff[0].email).toBe('teacher1@dms.edu.bd');
    expect(body.staff[0].roleBn).toBe('শিক্ষক');
    expect(body.staff[1].roleEn).toBe('Coordinator');
  });

  test('GET /schools/{schoolId}/sensor-sites returns verified playground telemetry', async () => {
    jest.spyOn(docClient, 'send').mockResolvedValueOnce({
      Items: [
        {
          timestamp: new Date().toISOString(),
          readings: { temperature_c: 31.0, relative_humidity_pct: 65, heat_index_c: 35.5, pm25_ugm3: 38.0 },
        },
      ],
    } as never);

    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/schools/school-dhaka-001/sensor-sites',
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sites).toHaveLength(3);
    expect(body.sites[0].heat_index_c).toBe(35.5);
    expect(body.sites[0].is_online).toBe(true);
    expect(body.sites[1].location_type).toBe('COURTYARD');
    expect(body.sites[2].location_type).toBe('CLASSROOM');
  });

  test('GET /schools/{schoolId}/analytics returns calculated aggregations', async () => {
    jest.spyOn(docClient, 'send').mockResolvedValueOnce({
      Items: [
        { readings: { aqi: 120, heat_index_c: 38.0 }, evaluation: { decision: 'MODIFY' } },
        { readings: { aqi: 80, heat_index_c: 32.0 }, evaluation: { decision: 'PROCEED' } },
      ],
    } as never);

    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/schools/school-dhaka-001/analytics',
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.avg_aqi).toBe(100);
    expect(body.max_heat_index_c).toBe(38.0);
    expect(body.total_sessions_analyzed).toBe(2);
  });

  test('GET /schools/{schoolId}/current-decision returns null for activities when no routine exists (no fake defaults)', async () => {
    jest
      .spyOn(docClient, 'send')
      .mockResolvedValueOnce({
        Items: [
          {
            school_id: 'school-dhaka-001',
            school_name: 'Dhaka Model School',
            timestamp: new Date().toISOString(),
            readings: { heat_index_c: 26.0, aqi: 45 },
          },
        ],
      } as never)
      .mockResolvedValueOnce({ Item: null } as never) // No ROUTINE#current
      .mockResolvedValueOnce({ Item: null } as never) // No NOTE#latest
      .mockResolvedValueOnce({ Item: null } as never); // No OVERRIDE#active

    const res = await handler(
      makeEvent({
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.current_activity_bn).toBeNull();
    expect(body.current_activity_en).toBeNull();
    expect(body.next_activity_bn).toBeNull();
    expect(body.next_activity_en).toBeNull();
  });

  test('F-15: GET /policies/current returns authoritative Policy v1.2 specification', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/policies/current',
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.version).toBe('v1.2');
    expect(body.name).toBe('Model School Outdoor Activity Policy');
    expect(body.rules.length).toBe(6);
    expect(body.aqiBands).toBeDefined();
    expect(body.heatBands).toBeDefined();
  });

  test('F-08: POST and GET /schools/{schoolId}/notes saves and returns structured context note', async () => {
    let storedItem: any = null;
    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      if (command.input?.Item) {
        storedItem = command.input.Item;
        return {} as never;
      }
      if (command.input?.Key) {
        return { Item: storedItem } as never;
      }
      return {} as never;
    });

    const postRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/notes',
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: JSON.stringify({
          note: 'ক্লাস ৩ এর এক শিশুর কাশি ও শ্বাসকষ্ট হচ্ছে',
        }),
      })
    );
    expect(postRes.statusCode).toBe(200);
    const postBody = JSON.parse(postRes.body);
    expect(postBody.status).toBe('SAVED');
    expect(postBody.has_respiratory_condition).toBe(true);
    expect(postBody.safety_tier_stepped_up).toBe(true);

    const getRes = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/schools/school-dhaka-001/notes',
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
    );
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.activeNote).toBeDefined();
    expect(getBody.hasRespiratoryCondition).toBe(true);
  });
});
