process.env.API_JWT_SECRET = 'test-suite-secure-jwt-secret-for-jest-only-32bytes';
process.env.MCP_JWT_SECRET = 'test-suite-secure-mcp-secret-for-jest-only-32bytes';
import * as crypto from 'crypto';
import {
  handler,
  createSignedJwt,
  evaluatePolicyFloor,
  getWorstCaseConditionsForActivity,
  docClient,
  APIGatewayProxyEvent,
  getJwtSecret,
  getMcpJwtSecret,
  resetRateLimits,
  mintMcpTokenForChat,
  authenticateRequest,
  hashPassword,
  resetSecretsCache,
  ActivitySchema,
  evaluateDecisionForActivity,
  evaluatePolicy,
  isOverrideActive,
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

  test('S11: Unified CORS headers dynamically reflect allowed origin list for both OPTIONS and API routes', async () => {
    // OPTIONS with internal domain
    const resInternal = await handler(makeEvent({ httpMethod: 'OPTIONS', headers: { origin: 'https://airsafe.schools.internal' } }));
    expect(resInternal.statusCode).toBe(200);
    expect(resInternal.headers?.['Access-Control-Allow-Origin']).toBe('https://airsafe.schools.internal');

    // GET /policies/current with .gov.bd
    const resGov = await handler(makeEvent({ httpMethod: 'GET', path: '/policies/current', headers: { origin: 'https://airsafe.schools.gov.bd' } }));
    expect(resGov.statusCode).toBe(200);
    expect(resGov.headers?.['Access-Control-Allow-Origin']).toBe('https://airsafe.schools.gov.bd');

    // GET /policies/current with mobile Capacitor origin
    const resCap = await handler(makeEvent({ httpMethod: 'GET', path: '/policies/current', headers: { origin: 'capacitor://localhost' } }));
    expect(resCap.statusCode).toBe(200);
    expect(resCap.headers?.['Access-Control-Allow-Origin']).toBe('capacitor://localhost');

    // Untrusted origin falls back safely to default official origin
    const resUntrusted = await handler(makeEvent({ httpMethod: 'OPTIONS', headers: { origin: 'https://untrusted-site.com' } }));
    expect(resUntrusted.statusCode).toBe(200);
    expect(resUntrusted.headers?.['Access-Control-Allow-Origin']).toBe('https://airsafe.schools.gov.bd');
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
    const testPassword = '[REDACTED_PASSWORD]';
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
    const body = JSON.parse(inviteRes.body);
    expect(body.temporary_password).toBeUndefined();
    expect(body.password).toBeUndefined();
    expect(body.password_hash).toBeUndefined();
    expect(body.staff.password).toBeUndefined();
    expect(body.staff.password_hash).toBeUndefined();
  });

  test('F-12 & S3: Staff invitation by non-coordinator returns HTTP 403 Forbidden', async () => {
    const inviteRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/staff/invite',
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: JSON.stringify({
          email: 'unauthorized.teacher@dms.edu.bd',
        }),
      })
    );
    expect(inviteRes.statusCode).toBe(403);
    expect(JSON.parse(inviteRes.body).error).toContain('Forbidden');
  });

  test('F-12 & S3: Staff invitation with invalid email returns HTTP 400 Bad Request', async () => {
    const inviteRes = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/staff/invite',
        headers: { Authorization: `Bearer ${coordinatorToken}` },
        body: JSON.stringify({
          email: 'not-an-email',
        }),
      })
    );
    expect(inviteRes.statusCode).toBe(400);
    expect(JSON.parse(inviteRes.body).error).toContain('Valid school email is required');
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
    expect(body.suggested_follow_ups).toBeDefined();
    expect(body.suggested_follow_ups.length).toBeGreaterThanOrEqual(2);
  });

  test('POST /schools/{schoolId}/assistant/chat with stream=true returns Server-Sent Events stream (F-05)', async () => {
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

    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/assistant/chat',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ query: 'হালকা শরীরচর্চা কি বাইরে সম্ভব?', stream: true }),
      })
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Content-Type']).toBe('text/event-stream');
    expect(res.body).toContain('event: token\n');
    expect(res.body).toContain('event: completion\n');
    expect(res.body).toContain('suggested_follow_ups');
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

  test('F-15: GET /policies/current returns authoritative Policy v1.2 specification with UTF-8 charset and decision links', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/policies/current',
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Content-Type']).toBe('application/json; charset=utf-8');
    const body = JSON.parse(res.body);
    expect(body.version).toBe('v1.2');
    expect(body.name).toBe('Model School Outdoor Activity Policy');
    expect(body.rules.length).toBe(6);
    expect(body.rules[0].titleBn).toBe('তাপ ও বায়ু থ্রেশহোল্ড');
    expect(body.governed_decisions).toBeDefined();
    expect(body.governed_decisions.length).toBe(5);
    expect(body.active_schools).toBeDefined();
    expect(body.active_schools.some((s: any) => s.school_id === 'school-dhaka-001')).toBe(true);
    expect(body.active_decisions_link).toBe('/schools/{schoolId}/decision');
    expect(body.aqiBands).toBeDefined();
    expect(body.heatBands).toBeDefined();
  });

  test('F-08: POST and GET /schools/{schoolId}/notes saves, ties to activity, and returns notes list without overwriting', async () => {
    const storedItems: any[] = [];
    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      if (command.input?.Item) {
        storedItems.push(command.input.Item);
        return {} as never;
      }
      if (command.input?.KeyConditionExpression) {
        return { Items: storedItems } as never;
      }
      if (command.input?.Key) {
        const item = storedItems.find((i) => i.activity_id === command.input.Key.activity_id) || storedItems[storedItems.length - 1];
        return { Item: item } as never;
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
          activity_id: 'morning-pe',
          activity_name: 'সকালের পিই ক্লাস',
        }),
      })
    );
    expect(postRes.statusCode).toBe(200);
    const postBody = JSON.parse(postRes.body);
    expect(postBody.status).toBe('SAVED');
    expect(postBody.activity_id).toBe('morning-pe');
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
    expect(getBody.notes).toBeDefined();
    expect(getBody.notes.length).toBeGreaterThan(0);
    expect(getBody.notes[0].activity_id).toBe('morning-pe');
  });
  test('S4: Coordinator Override fails-closed with 503 when DynamoDB read throws an error', async () => {
    let putCalled = false;
    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      if (command.input?.TableName === 'AirSafe-Readings-dev') {
        throw new Error('ProvisionedThroughputExceededException: DynamoDB read failed');
      }
      if (command.input?.Item) {
        putCalled = true;
      }
      return {} as never;
    });

    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/overrides',
        headers: { Authorization: `Bearer ${coordinatorToken}` },
        body: JSON.stringify({ decision: 'PROCEED', reason: 'Principal special event exemption' }),
      })
    );
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Service Unavailable');
    expect(putCalled).toBe(false);
  });

  test('S4: Coordinator Override fails-closed with 503 when telemetry table is empty', async () => {
    // Force QueryCommand for telemetry table to return empty items
    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      if (command.input?.TableName === 'AirSafe-Readings-dev') {
        return { Items: [] } as never;
      }
      return {} as never;
    });

    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/overrides',
        headers: { Authorization: `Bearer ${coordinatorToken}` },
        body: JSON.stringify({ decision: 'PROCEED', reason: 'Principal special event exemption' }),
      })
    );
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Service Unavailable');
  });

  test('S4: Coordinator Override successfully records with dynamic routine intensity and relaxes_floor flag', async () => {
    let savedOverrideItem: any = null;
    let savedAuditItem: any = null;

    jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
      // Return vigorous active routine
      if (command.input?.Key?.activity_id === 'ROUTINE#current') {
        return { Item: { intensity: 'VIGOROUS' } } as never;
      }
      // Return high heat/AQI reading that creates MOVE_INDOORS floor
      if (command.input?.TableName === 'AirSafe-Readings-dev') {
        return {
          Items: [
            {
              school_id: 'school-dhaka-001',
              timestamp: new Date().toISOString(),
              readings: { heat_index_c: 42.0, aqi: 170 },
            },
          ],
        } as never;
      }
      if (command.input?.Item?.activity_id === 'OVERRIDE#active') {
        savedOverrideItem = command.input.Item;
      }
      if (command.input?.Item?.activity_id?.startsWith('OVERRIDE_AUDIT#')) {
        savedAuditItem = command.input.Item;
      }
      return {} as never;
    });

    // Coordinator requests MODIFY while floor for VIGOROUS at AQI 170 is MOVE_INDOORS
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/schools/school-dhaka-001/overrides',
        headers: { Authorization: `Bearer ${coordinatorToken}` },
        body: JSON.stringify({
          decision: 'MODIFY',
          reason: 'Indoor ventilation upgraded with HEPA filters for graduation',
        }),
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('RECORDED');
    expect(body.relaxes_floor).toBe(true);
    expect(body.policy_floor).toBe('MOVE_INDOORS');
    expect(savedOverrideItem.relaxes_floor).toBe(true);
    expect(savedOverrideItem.intensity).toBe('vigorous');
    expect(savedAuditItem.relaxes_floor).toBe(true);
    expect(savedAuditItem.coordinator_email).toBe('rafiq.principal@dms.edu.bd');
  });

  describe('S8 (S-6 Input Validation): JSON Schema enforcement for routines and overrides', () => {
    test('POST /routines rejects invalid duration_minutes with 400', async () => {
      // Test negative duration
      const resNeg = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            intensity: 'MODERATE',
            duration_minutes: -10,
            location_type: 'FIELD',
          }),
        })
      );
      expect(resNeg.statusCode).toBe(400);
      const bodyNeg = JSON.parse(resNeg.body);
      expect(bodyNeg.error).toContain('Validation failed');

      // Test zero duration
      const resZero = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            intensity: 'MODERATE',
            duration_minutes: 0,
            location_type: 'FIELD',
          }),
        })
      );
      expect(resZero.statusCode).toBe(400);

      // Test duration exceeding 480 minutes
      const resHigh = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            intensity: 'MODERATE',
            duration_minutes: 1000,
            location_type: 'FIELD',
          }),
        })
      );
      expect(resHigh.statusCode).toBe(400);

      // Test non-integer duration
      const resString = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            intensity: 'MODERATE',
            duration_minutes: 'not_a_number',
            location_type: 'FIELD',
          }),
        })
      );
      expect(resString.statusCode).toBe(400);
    });

    test('POST /routines rejects invalid location_type with 400', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            intensity: 'MODERATE',
            duration_minutes: 45,
            location_type: 'OUTER_SPACE',
          }),
        })
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Validation failed');
    });

    test('POST /routines rejects invalid intensity with 400', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            intensity: 'HYPER_INTENSE',
            duration_minutes: 45,
            location_type: 'FIELD',
          }),
        })
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Validation failed');
    });

    test('POST /routines accepts valid payload and persists routine with 200', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async () => ({} as never));

      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            activity_name_bn: 'ফুটবল অনুশীলন',
            activity_name_en: 'Football Practice',
            intensity: 'VIGOROUS',
            duration_minutes: 60,
            location_type: 'FIELD',
            target_class: 'Class 8-10',
          }),
        })
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('UPDATED');
      expect(body.routine.duration_minutes).toBe(60);
      expect(body.routine.intensity).toBe('vigorous');
      expect(body.routine.location_type).toBe('FIELD');
    });

    test('POST /overrides rejects invalid decision enum with 400', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/overrides',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            decision: 'SUPER_SAFE_DECISION',
            reason: 'Annual school sports day exemption',
          }),
        })
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Validation failed');
    });

    test('POST /overrides rejects short reason (< 5 characters) with 400', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/overrides',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            decision: 'PROCEED',
            reason: 'test',
          }),
        })
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Validation failed');
    });

    test('POST /overrides and /routines reject malformed JSON with 400', async () => {
      const resRoutine = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: '{malformed_json: true, missing_quotes}',
        })
      );
      expect(resRoutine.statusCode).toBe(400);
      expect(JSON.parse(resRoutine.body).error).toContain('Invalid JSON');

      const resOverride = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/overrides',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: 'NOT_EVEN_JSON',
        })
      );
      expect(resOverride.statusCode).toBe(400);
      expect(JSON.parse(resOverride.body).error).toContain('Invalid JSON');
    });
  });

  describe('P2: Policy Rule 2 - Worst-Case Environmental Forecast Evaluation', () => {
    test('Resolves peak AQI and Heat Index when forecast worsens during activity window', () => {
      const now = new Date();
      const forecastInWindow = new Date(now.getTime() + 20 * 60 * 1000).toISOString();
      const forecastLater = new Date(now.getTime() + 180 * 60 * 1000).toISOString();

      const worst = getWorstCaseConditionsForActivity({
        currentAqi: 45,
        currentHeatIndexC: 25,
        durationMinutes: 45,
        hourlyForecast: [
          {
            time: forecastInWindow,
            usAqi: 155, // Spikes to UNHEALTHY during activity
            heatIndexC: 38.5, // Spikes to EXTREME CAUTION during activity
          },
          {
            time: forecastLater,
            usAqi: 250, // Much worse, but 3 hours later (outside activity window)
            heatIndexC: 45,
          },
        ],
        startTime: now,
      });

      expect(worst.worstAqi).toBe(155);
      expect(worst.worstHeatIndexC).toBe(38.5);
      expect(worst.isForecastWorse).toBe(true);
      expect(worst.forecastPeakReason).toContain('155');
      expect(worst.forecastPeakReason).toContain('38.5');

      // Policy decision using worst-case forecast should enforce stricter decision (MOVE_INDOORS for vigorous)
      const currentOnlyEval = evaluatePolicyFloor({ heatIndexC: 25, aqi: 45, intensity: 'VIGOROUS' });
      expect(currentOnlyEval.decision).toBe('PROCEED');

      const worstCaseEval = evaluatePolicyFloor({ heatIndexC: worst.worstHeatIndexC, aqi: worst.worstAqi, intensity: 'VIGOROUS' });
      expect(worstCaseEval.decision).toBe('MOVE_INDOORS');
    });

    test('Retains current readings when forecast conditions are milder or equal', () => {
      const now = new Date();
      const forecastTime = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

      const worst = getWorstCaseConditionsForActivity({
        currentAqi: 120,
        currentHeatIndexC: 35,
        durationMinutes: 30,
        hourlyForecast: [
          {
            time: forecastTime,
            usAqi: 60, // Cleaner in forecast
            heatIndexC: 29, // Cooler in forecast
          },
        ],
        startTime: now,
      });

      expect(worst.worstAqi).toBe(120);
      expect(worst.worstHeatIndexC).toBe(35);
      expect(worst.isForecastWorse).toBe(false);
    });

    test('Ignores forecast points outside the scheduled activity window', () => {
      const now = new Date();
      // Forecast spike is 4 hours into future, whereas activity is only 30 minutes
      const futureSpikeTime = new Date(now.getTime() + 240 * 60 * 1000).toISOString();

      const worst = getWorstCaseConditionsForActivity({
        currentAqi: 40,
        currentHeatIndexC: 25,
        durationMinutes: 30,
        hourlyForecast: [
          {
            time: futureSpikeTime,
            usAqi: 220,
            heatIndexC: 42,
          },
        ],
        startTime: now,
      });

      expect(worst.worstAqi).toBe(40);
      expect(worst.worstHeatIndexC).toBe(25);
      expect(worst.isForecastWorse).toBe(false);
    });
  });
  describe('P5 (Fail-Closed Telemetry Standardization): Unified UNKNOWN on non-finite input', () => {
    test('P5: Both evaluatePolicy and evaluatePolicyFloor consistently fail closed to UNKNOWN on non-finite input', () => {
      // 1. evaluatePolicy with NaN / Infinity
      const nanPolicyRes = evaluatePolicy(NaN, 30.0, 'VIGOROUS');
      expect(nanPolicyRes.decision).toBe('UNKNOWN');
      expect(nanPolicyRes.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      const infPolicyRes = evaluatePolicy(60, Infinity, 'LIGHT');
      expect(infPolicyRes.decision).toBe('UNKNOWN');
      expect(infPolicyRes.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      const negInfPolicyRes = evaluatePolicy(-Infinity, 30.0, 'MODERATE');
      expect(negInfPolicyRes.decision).toBe('UNKNOWN');
      expect(negInfPolicyRes.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      // 2. evaluatePolicyFloor with NaN / Infinity
      const nanFloorRes = evaluatePolicyFloor({ heatIndexC: NaN, aqi: 50, intensity: 'VIGOROUS' });
      expect(nanFloorRes.decision).toBe('UNKNOWN');
      expect(nanFloorRes.status).toBe('UNKNOWN');

      const infFloorRes = evaluatePolicyFloor({ heatIndexC: 30, aqi: Infinity, intensity: 'LIGHT' });
      expect(infFloorRes.decision).toBe('UNKNOWN');
      expect(infFloorRes.status).toBe('UNKNOWN');
    });
  });

  describe('P4 (F-10 Routine & Activity Modeling): Granular ACTIVITY#<id> and per-activity policy decisions', () => {
    test('ActivitySchema validates valid activity and rejects invalid intensity / duration', () => {
      const validActivity = {
        name_bn: 'প্রাতঃকালীন সমাবেশ',
        name_en: 'Morning Assembly',
        time_slot: '08:30 - 09:15',
        intensity: 'LIGHT',
        location_type: 'COURTYARD',
        target_class: 'All Classes',
        duration_minutes: 30,
        is_current: true,
      };
      const parsed = ActivitySchema.safeParse(validActivity);
      expect(parsed.success).toBe(true);

      // Rejects invalid intensity
      const invalidInt = ActivitySchema.safeParse({ ...validActivity, intensity: 'SUPER_EXTREME' });
      expect(invalidInt.success).toBe(false);

      // Rejects invalid duration
      const invalidDur = ActivitySchema.safeParse({ ...validActivity, duration_minutes: 0 });
      expect(invalidDur.success).toBe(false);
    });

    test('evaluateDecisionForActivity computes tailored decisions per activity intensity under same weather', () => {
      // Per Policy v1.2: Under Heat Index 36°C (Extreme Caution / Danger boundary)
      // Light intensity allows activity with precautions (YELLOW / PROCEED_WITH_PRECAUTIONS)
      // Vigorous intensity requires moving indoors (RED / MOVE_INDOORS)
      const lightActivity = {
        id: 'assembly',
        name_bn: 'প্রাতঃকালীন সমাবেশ',
        name_en: 'Morning Assembly',
        time_slot: '08:30 - 09:15',
        intensity: 'LIGHT',
        location_type: 'COURTYARD',
        duration_minutes: 30,
        is_current: true,
      };

      const vigorousActivity = {
        id: 'pe-football',
        name_bn: 'শারীরিক শিক্ষা (ফুটবল)',
        name_en: 'PE Football Practice',
        time_slot: '09:30 - 10:15',
        intensity: 'VIGOROUS',
        location_type: 'FIELD',
        duration_minutes: 45,
        is_current: false,
      };

      const lightDecision = evaluateDecisionForActivity({
        activity: lightActivity,
        currentAqi: 65,
        currentHeatIndexC: 40,
      });

      const vigorousDecision = evaluateDecisionForActivity({
        activity: vigorousActivity,
        currentAqi: 65,
        currentHeatIndexC: 40,
      });

      // Light activity can proceed with precautions or modify, but vigorous activity under 36°C HI is restricted
      expect(['PROCEED', 'PROCEED_WITH_PRECAUTIONS', 'MODIFY']).toContain(lightDecision.decision);
      expect(vigorousDecision.decision).toBe('MOVE_INDOORS');
      expect(vigorousDecision.status).toBe('RED');
      expect(lightDecision.decision).not.toBe(vigorousDecision.decision);
    });

    test('POST /schools/{schoolId}/routines with activities array persists individual ACTIVITY#<id> items', async () => {
      const putCalls: any[] = [];
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command?.input?.Item) {
          putCalls.push(command.input.Item);
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            activities: [
              {
                id: 'act-assembly',
                name_bn: 'প্রাতঃকালীন সমাবেশ',
                name_en: 'Morning Assembly',
                time_slot: '08:30 - 09:00',
                intensity: 'LIGHT',
                location_type: 'COURTYARD',
                target_class: 'All',
                duration_minutes: 30,
                is_current: true,
              },
              {
                id: 'act-pe-class9',
                name_bn: 'শারীরিক শিক্ষা (ফুটবল)',
                name_en: 'PE Football',
                time_slot: '09:15 - 10:00',
                intensity: 'VIGOROUS',
                location_type: 'FIELD',
                target_class: 'Class 9',
                duration_minutes: 45,
                is_current: false,
              },
            ],
          }),
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('UPDATED');
      expect(body.activities).toHaveLength(2);

      // Verify that individual ACTIVITY# items were saved to DECISIONS_TABLE_NAME
      const assemblyItem = putCalls.find((i) => i.activity_id === 'ACTIVITY#act-assembly');
      const peItem = putCalls.find((i) => i.activity_id === 'ACTIVITY#act-pe-class9');
      const routineCurrent = putCalls.find((i) => i.activity_id === 'ROUTINE#current');

      expect(assemblyItem).toBeDefined();
      expect(assemblyItem.time_slot).toBe('08:30 - 09:00');
      expect(assemblyItem.intensity).toBe('LIGHT');
      expect(assemblyItem.location_type).toBe('COURTYARD');

      expect(peItem).toBeDefined();
      expect(peItem.time_slot).toBe('09:15 - 10:00');
      expect(peItem.intensity).toBe('VIGOROUS');
      expect(peItem.target_class).toBe('Class 9');

      expect(routineCurrent).toBeDefined();
      expect(routineCurrent.activity_name_bn).toBe('প্রাতঃকালীন সমাবেশ');
    });

    test('GET /schools/{schoolId}/routines returns evaluated activities with individual decisions', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        // Mock query for TABLE_NAME (readings)
        if (command?.input?.TableName === 'AirSafe-Telemetry-dev' || command?.input?.ScanIndexForward === false) {
          return {
            Items: [
              {
                timestamp: new Date().toISOString(),
                readings: { heat_index_c: 40, aqi: 70 },
              },
            ],
          } as never;
        }
        // Mock query for DECISIONS_TABLE_NAME (activities)
        if (command?.input?.KeyConditionExpression && command.input.KeyConditionExpression.includes('begins_with')) {
          return {
            Items: [
              {
                id: 'assembly',
                activity_id: 'ACTIVITY#assembly',
                name_bn: 'প্রাতঃকালীন সমাবেশ',
                name_en: 'Morning Assembly',
                time_slot: '08:30 - 09:00',
                intensity: 'LIGHT',
                location_type: 'COURTYARD',
                target_class: 'All',
                duration_minutes: 30,
                is_current: true,
                order: 1,
              },
              {
                id: 'pe-football',
                activity_id: 'ACTIVITY#pe-football',
                name_bn: 'শারীরিক শিক্ষা (ফুটবল)',
                name_en: 'PE Football',
                time_slot: '09:15 - 10:00',
                intensity: 'VIGOROUS',
                location_type: 'FIELD',
                target_class: 'Class 8',
                duration_minutes: 45,
                is_current: false,
                order: 2,
              },
            ],
          } as never;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.school_id).toBe('school-dhaka-001');
      expect(body.activities).toHaveLength(2);

      const assemblyAct = body.activities.find((a: any) => a.id === 'assembly');
      const peAct = body.activities.find((a: any) => a.id === 'pe-football');

      expect(assemblyAct).toBeDefined();
      expect(peAct).toBeDefined();

      // Per-activity individual decisions:
      expect(['PROCEED', 'PROCEED_WITH_PRECAUTIONS', 'MODIFY']).toContain(assemblyAct.decision);
      expect(peAct.decision).toBe('MOVE_INDOORS');
      expect(peAct.status).toBe('RED');
      expect(body.current_activity.id).toBe('assembly');
      expect(body.next_activity.id).toBe('pe-football');
    });
  });
  describe('P6 & U-5 (Real Per-Sensor Telemetry & Anti-Fabrication)', () => {
    test('P6 & U-5: GET /sensor-sites reads genuine LATEST#<sensor_id> items and returns "ডেটা নেই" / null for unmeasured sites', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        // Mock Query for sensor items
        if (command?.input?.KeyConditionExpression && command.input.KeyConditionExpression.includes('school_id')) {
          return {
            Items: [
              {
                school_id: 'school-dhaka-001',
                timestamp: 'LATEST#dhk-001-field-1',
                sensor_id: 'dhk-001-field-1',
                location_type: 'FIELD',
                observed_at: new Date().toISOString(),
                readings: { temperature_c: 32.1, relative_humidity_pct: 64, heat_index_c: 36.2, pm25_ugm3: 40.5 },
                is_online: true,
              },
              {
                school_id: 'school-dhaka-001',
                timestamp: 'LATEST#dhk-001-courtyard-1',
                sensor_id: 'dhk-001-courtyard-1',
                location_type: 'COURTYARD',
                observed_at: new Date().toISOString(),
                readings: { temperature_c: 29.8, relative_humidity_pct: 70, heat_index_c: 33.1, pm25_ugm3: 35.0 },
                is_online: true,
              },
              // NOTE: dhk-001-classroom-101 is NOT returned (simulating unmeasured / uninstalled classroom sensor)
            ],
          } as never;
        }
        return { Items: [] } as never;
      });

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

      const fieldSite = body.sites.find((s: any) => s.location_type === 'FIELD');
      const courtyardSite = body.sites.find((s: any) => s.location_type === 'COURTYARD');
      const classroomSite = body.sites.find((s: any) => s.location_type === 'CLASSROOM');

      // Genuine measured readings from LATEST# items
      expect(fieldSite.temp_c).toBe(32.1);
      expect(fieldSite.is_online).toBe(true);

      expect(courtyardSite.temp_c).toBe(29.8);
      expect(courtyardSite.is_online).toBe(true);

      // Unmeasured classroom sensor: MUST NOT fabricate values (-1.9°C, 60%, etc.)
      expect(classroomSite.temp_c).toBeNull();
      expect(classroomSite.rh_pct).toBeNull();
      expect(classroomSite.pm25_ugm3).toBeNull();
      expect(classroomSite.heat_index_c).toBeNull();
      expect(classroomSite.is_online).toBe(false);
      expect(classroomSite.last_updated_bn).toBe('ডেটা নেই');
      expect(classroomSite.last_updated_en).toBe('No data');
    });
  });

  describe('P7: Override activity and date binding, expires_at, and historical retention', () => {
    const coordinatorToken = createSignedJwt({
      email: 'rafiq.principal@dms.edu.bd',
      school_id: 'school-dhaka-001',
      role: 'COORDINATOR',
    });

    test('isOverrideActive accurately checks expiration, date matching, and activity binding', () => {
      const today = new Date().toISOString().slice(0, 10);
      const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
      const futureTime = new Date(Date.now() + 3600 * 1000).toISOString();

      // 1. Missing override or decision
      expect(isOverrideActive(null)).toBe(false);
      expect(isOverrideActive({})).toBe(false);

      // 2. Expired override
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', expires_at: pastTime })).toBe(false);

      // 3. Active future override
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', expires_at: futureTime })).toBe(true);

      // 4. Date matching
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', date: '2020-01-01' })).toBe(false);
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', date: today })).toBe(true);

      // 5. Activity binding
      const act1 = { id: 'pe-football', is_current: false };
      const act2 = { id: 'assembly', is_current: true };

      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', target_activity_id: 'pe-football' }, act1)).toBe(true);
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', target_activity_id: 'pe-football' }, act2)).toBe(false);
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', target_activity_id: 'current' }, act1)).toBe(false);
      expect(isOverrideActive({ requested_decision: 'MOVE_INDOORS', target_activity_id: 'current' }, act2)).toBe(true);
    });

    test('POST /overrides binds to activity and date, sets expires_at, and saves bound item', async () => {
      let savedBoundItem: any = null;
      let savedActiveItem: any = null;
      let savedAuditItem: any = null;

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.Key?.activity_id === 'ACTIVITY#pe-football') {
          return { Item: { intensity: 'VIGOROUS' } } as never;
        }
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return {
            Items: [
              {
                school_id: 'school-dhaka-001',
                timestamp: new Date().toISOString(),
                readings: { heat_index_c: 24.0, aqi: 45 },
              },
            ],
          } as never;
        }
        if (command.input?.Item?.activity_id?.startsWith('OVERRIDE#2026-')) {
          savedBoundItem = command.input.Item;
        }
        if (command.input?.Item?.activity_id === 'OVERRIDE#active') {
          savedActiveItem = command.input.Item;
        }
        if (command.input?.Item?.activity_id?.startsWith('OVERRIDE_AUDIT#')) {
          savedAuditItem = command.input.Item;
        }
        return {} as never;
      });

      const today = new Date().toISOString().slice(0, 10);
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/overrides',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            decision: 'MOVE_INDOORS',
            reason: 'Heavy localized dust and smoke near football field',
            activity_id: 'pe-football',
            date: today,
            duration_minutes: 90,
          }),
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('RECORDED');
      expect(body.date).toBe(today);
      expect(body.target_activity_id).toBe('pe-football');
      expect(body.expires_at).toBeDefined();

      expect(savedBoundItem).toBeDefined();
      expect(savedBoundItem.activity_id).toBe(`OVERRIDE#${today}#pe-football`);
      expect(savedBoundItem.target_activity_id).toBe('pe-football');
      expect(savedBoundItem.expires_at).toBe(body.expires_at);

      expect(savedActiveItem).toBeDefined();
      expect(savedActiveItem.target_activity_id).toBe('pe-football');
      expect(savedActiveItem.expires_at).toBe(body.expires_at);

      expect(savedAuditItem).toBeDefined();
      expect(savedAuditItem.target_activity_id).toBe('pe-football');
    });

    test('Expired override in DynamoDB is ignored by policy evaluation, restoring policy floor', async () => {
      const pastTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
      const today = new Date().toISOString().slice(0, 10);

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return {
            Items: [
              {
                school_id: 'school-dhaka-001',
                timestamp: new Date().toISOString(),
                readings: { heat_index_c: 24.0, aqi: 45 }, // Mild -> PROCEED
              },
            ],
          } as never;
        }
        if (command.input?.Key?.activity_id === 'OVERRIDE#active') {
          return {
            Item: {
              activity_id: 'OVERRIDE#active',
              requested_decision: 'MOVE_INDOORS',
              reason: 'Old expired dust storm override',
              expires_at: pastTime,
              date: today,
              target_activity_id: 'current',
            },
          } as never;
        }
        return { Items: [] } as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/current-decision',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // Because override is expired, policy decision remains at policy floor (PROCEED), NOT MOVE_INDOORS
      expect(body.decision).toBe('PROCEED');
      expect(body.policy_floor_decision).toBe('PROCEED');
      expect(body.active_override).toBeNull();
    });

    test('POST /overrides records relaxing override with relaxes_floor=true and audit log (S4 / F-11)', async () => {
      let savedAudit: any = null;
      let savedOverride: any = null;
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return {
            Items: [
              {
                school_id: 'school-dhaka-001',
                timestamp: new Date().toISOString(),
                readings: { heat_index_c: 44.0, aqi: 220 }, // Severe hazard -> MOVE_INDOORS floor
              },
            ],
          } as never;
        }
        if (command.input?.Item?.activity_id === 'OVERRIDE#active') {
          savedOverride = command.input.Item;
        }
        if (command.input?.Item?.activity_id?.startsWith('OVERRIDE_AUDIT#')) {
          savedAudit = command.input.Item;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/overrides',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            decision: 'MODIFY',
            reason: 'High-performance HEPA purifiers activated in auditorium',
            activity_id: 'current',
            duration_minutes: 60,
          }),
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('RECORDED');
      expect(body.relaxes_floor).toBe(true);
      expect(body.policy_floor).toBe('MOVE_INDOORS');
      expect(savedOverride.relaxes_floor).toBe(true);
      expect(savedAudit.relaxes_floor).toBe(true);
      expect(savedAudit.policy_floor).toBe('MOVE_INDOORS');
    });

    test('GET /overrides/audit and GET /audit return immutable override audit trail (F-11)', async () => {
      const mockAuditItems = [
        {
          activity_id: 'OVERRIDE_AUDIT#2026-10-26T10:00:00.000Z',
          school_id: 'school-dhaka-001',
          requested_decision: 'MOVE_INDOORS',
          policy_floor: 'MODIFY',
          relaxes_floor: false,
          reason: 'Excessive localized construction smoke',
          coordinator_email: 'coordinator@dms.edu.bd',
          target_activity_id: 'current',
          expires_at: '2026-10-26T12:00:00.000Z',
          date: '2026-10-26',
          timestamp: '2026-10-26T10:00:00.000Z',
        },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.KeyConditionExpression?.includes('OVERRIDE_AUDIT#') || command.input?.ExpressionAttributeValues?.[':prefix'] === 'OVERRIDE_AUDIT#') {
          return { Items: mockAuditItems } as never;
        }
        return { Items: [] } as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/overrides/audit',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.audit_logs).toBeDefined();
      expect(body.audit_logs.length).toBe(1);
      expect(body.audit_logs[0].coordinator_email).toBe('coordinator@dms.edu.bd');
      expect(body.audit_logs[0].policy_floor).toBe('MODIFY');
      expect(body.audit_logs[0].expires_at).toBe('2026-10-26T12:00:00.000Z');
    });

    test('POST /notes and POST /routines preserve history without overwriting previous items', async () => {
      const savedItems: any[] = [];
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.Item) {
          savedItems.push(command.input.Item);
        }
        return {} as never;
      });

      // Save a note
      const noteRes = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/notes',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ note: 'Student reported asthma difficulty in courtyard' }),
        })
      );
      expect(noteRes.statusCode).toBe(200);
      expect(savedItems.some((item) => item.activity_id === 'NOTE#latest')).toBe(true);
      expect(savedItems.some((item) => item.activity_id.startsWith('NOTE#2026-'))).toBe(true);

      // Save a routine
      const routineRes = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/routines',
          headers: { Authorization: `Bearer ${coordinatorToken}` },
          body: JSON.stringify({
            activity_name_bn: 'ফুটবল অনুশীলন',
            activity_name_en: 'Football Practice',
            intensity: 'vigorous',
            location_type: 'FIELD',
            duration_minutes: 60,
          }),
        })
      );
      expect(routineRes.statusCode).toBe(200);
      expect(savedItems.some((item) => item.activity_id === 'ROUTINE#current')).toBe(true);
      expect(savedItems.some((item) => item.activity_id.startsWith('ROUTINE#2026-'))).toBe(true);
    });

    test('GET /overrides returns active status, date, and expires_at', async () => {
      const futureTime = new Date(Date.now() + 3600 * 1000).toISOString();
      const today = new Date().toISOString().slice(0, 10);

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.Key?.activity_id === 'OVERRIDE#active') {
          return {
            Item: {
              activity_id: 'OVERRIDE#active',
              requested_decision: 'MOVE_INDOORS',
              reason: 'Ongoing campus construction dust',
              expires_at: futureTime,
              date: today,
              target_activity_id: 'current',
            },
          } as never;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/overrides',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isActive).toBe(true);
      expect(body.expires_at).toBe(futureTime);
      expect(body.target_activity_id).toBe('current');
      expect(body.date).toBe(today);
    });
  });

  describe('F-20: 3 Demo Schools ID Alignment & 64 Districts Public Feed', () => {
    const MOCK_TEST_PASSWORD = 'MockUnitTestCredential_OnlyForTesting#2026';
    beforeEach(() => {
      jest.restoreAllMocks();
      resetRateLimits();
      const mockSeededHash = hashPassword(MOCK_TEST_PASSWORD);
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.Key?.school_id === 'STAFF_LOOKUP') {
          const actId = command.input.Key.activity_id || '';
          if (actId.includes('chs')) return { Item: { target_school_id: 'school-chattogram-001' } } as never;
          if (actId.includes('rps')) return { Item: { target_school_id: 'school-rajshahi-001' } } as never;
        }
        if (command.input?.Key?.activity_id === 'STAFF#nusrat.teacher@chs.edu.bd') {
          return {
            Item: {
              email: 'nusrat.teacher@chs.edu.bd',
              school_id: 'school-chattogram-001',
              role: 'TEACHER',
              password_hash: mockSeededHash,
              name_bn: 'সহকারী শিক্ষক নুসরাত জাহান',
              name_en: 'Assistant Teacher Nusrat Jahan',
              school_name_bn: 'চট্টগ্রাম হিলস স্কুল',
              school_name_en: 'Chittagong Hills School',
            },
          } as never;
        }
        if (command.input?.Key?.activity_id === 'STAFF#tareq.teacher@rps.edu.bd') {
          return {
            Item: {
              email: 'tareq.teacher@rps.edu.bd',
              school_id: 'school-rajshahi-001',
              role: 'TEACHER',
              password_hash: mockSeededHash,
              name_bn: 'সহকারী শিক্ষক তারেক রহমান',
              name_en: 'Assistant Teacher Tareq Rahman',
              school_name_bn: 'রাজশাহী পদ্মা স্কুল',
              school_name_en: 'Rajshahi Padma School',
            },
          } as never;
        }
        return {} as never;
      });
    });

    test('POST /auth/login successfully authenticates Chittagong teacher with school-chattogram-001', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/auth/login',
          body: JSON.stringify({
            email: 'nusrat.teacher@chs.edu.bd',
            password: MOCK_TEST_PASSWORD,
          }),
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe('nusrat.teacher@chs.edu.bd');
      expect(body.user.school_id).toBe('school-chattogram-001');
      expect(body.user.role).toBe('TEACHER');
      expect(body.token).toBeDefined();
    });

    test('POST /auth/login successfully authenticates Rajshahi teacher with school-rajshahi-001', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/auth/login',
          body: JSON.stringify({
            email: 'tareq.teacher@rps.edu.bd',
            password: MOCK_TEST_PASSWORD,
          }),
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe('tareq.teacher@rps.edu.bd');
      expect(body.user.school_id).toBe('school-rajshahi-001');
      expect(body.user.role).toBe('TEACHER');
      expect(body.token).toBeDefined();
    });

    test('F-01 & S1: POST /auth/login rejects uninvited / non-existent account with HTTP 401 (backdoor eliminated)', async () => {
      const res = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/auth/login',
          body: JSON.stringify({
            email: 'uninvited.stranger@external.edu.bd',
            password: MOCK_TEST_PASSWORD,
          }),
        })
      );

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Invalid credentials or uninvited account');
    });

    test('F-01 & S3: POST /auth/login fails closed with 401 when Cognito User Pool rejects credentials', async () => {
      process.env.USER_POOL_ID = 'ap-southeast-2_TestUserPool';
      process.env.USER_POOL_CLIENT_ID = 'test-client-id';

      const originalCognito = await import('@aws-sdk/client-cognito-identity-provider');
      const spy = jest.spyOn(originalCognito.CognitoIdentityProviderClient.prototype, 'send')
        .mockRejectedValueOnce(new Error('NotAuthorizedException: Incorrect username or password.') as never);

      try {
        const res = await handler(
          makeEvent({
            httpMethod: 'POST',
            path: '/auth/login',
            body: JSON.stringify({
              email: 'nusrat.teacher@chs.edu.bd',
              password: 'WrongPassword123!',
            }),
          })
        );

        expect(res.statusCode).toBe(401);
        const body = JSON.parse(res.body);
        expect(body.error).toContain('Cognito User Pool');
      } finally {
        spy.mockRestore();
        delete process.env.USER_POOL_ID;
        delete process.env.USER_POOL_CLIENT_ID;
      }
    });

    test('F-01 & S3: POST /auth/login returns genuine Cognito IdToken when Cognito authentication succeeds', async () => {
      process.env.USER_POOL_ID = 'ap-southeast-2_TestUserPool';
      process.env.USER_POOL_CLIENT_ID = 'test-client-id';

      const originalCognito = await import('@aws-sdk/client-cognito-identity-provider');
      const spy = jest.spyOn(originalCognito.CognitoIdentityProviderClient.prototype, 'send')
        .mockResolvedValueOnce({
          AuthenticationResult: {
            IdToken: 'cognito.id.token.jwt.here',
          },
        } as never);

      try {
        const res = await handler(
          makeEvent({
            httpMethod: 'POST',
            path: '/auth/login',
            body: JSON.stringify({
              email: 'nusrat.teacher@chs.edu.bd',
              password: MOCK_TEST_PASSWORD,
            }),
          })
        );

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.token).toBe('cognito.id.token.jwt.here');
        expect(body.user.email).toBe('nusrat.teacher@chs.edu.bd');
      } finally {
        spy.mockRestore();
        delete process.env.USER_POOL_ID;
        delete process.env.USER_POOL_CLIENT_ID;
      }
    });

    test('F-02 MUST: GET /schools/{schoolId}/decision returns next_activity, confidence_level_pct, and change_forecast', async () => {
      const nowIso = new Date().toISOString();
      const futureTimeIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      jest
        .spyOn(docClient, 'send')
        .mockResolvedValueOnce({
          Items: [
            {
              school_id: 'school-dhaka-001',
              school_name: 'Dhaka Model School',
              timestamp: nowIso,
              is_modeled: false,
              readings: { heat_index_c: 32.0, aqi: 75, pm25_ugm3: 20.0 },
              hourly_forecast: [
                {
                  time: futureTimeIso,
                  heat_index_c: 39.5,
                  aqi: 120,
                  pm25_ugm3: 45.0,
                },
              ],
            },
          ],
        } as never)
        .mockResolvedValueOnce({
          Item: {
            activity_id: 'ROUTINE#current',
            intensity: 'moderate',
            activity_name_bn: 'সকালের পিই ক্লাস',
            activity_name_en: 'Morning PE Class',
            next_activity_bn: 'স্কুল সমাবেশ',
            next_activity_en: 'School Assembly',
          },
        } as never)
        .mockResolvedValueOnce({ Item: null } as never)
        .mockResolvedValueOnce({ Item: null } as never);

      const res = await handler(
        makeEvent({
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.confidence_level_pct).toBe(95);
      expect(body.confidence_label_bn).toContain('ক্যাম্পাস IoT সেন্সর');
      expect(body.confidence_label_en).toContain('Campus IoT Sensor');
      expect(body.change_forecast_bn).toBeDefined();
      expect(body.change_forecast_en).toBeDefined();
      expect(body.expected_change_at).toBe(futureTimeIso);
      expect(body.next_activity_bn).toBe('স্কুল সমাবেশ');
      expect(body.next_activity).toBeDefined();
      expect(body.next_activity.name_bn).toBe('স্কুল সমাবেশ');
    });

    test('GET /districts returns 64 districts public feeds from DynamoDB', async () => {
      const mockDistricts = [
        { school_id: 'bd-dhaka', timestamp: 'LATEST#bd-dhaka', district_name: 'Dhaka', division: 'Dhaka', readings: { aqi: 155 } },
        { school_id: 'bd-chattogram', timestamp: 'LATEST#bd-chattogram', district_name: 'Chattogram', division: 'Chattogram', readings: { aqi: 115 } },
        { school_id: 'bd-rajshahi', timestamp: 'LATEST#bd-rajshahi', district_name: 'Rajshahi', division: 'Rajshahi', readings: { aqi: 118 } },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return { Items: mockDistricts } as never;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/districts',
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalDistricts).toBe(3);
      expect(body.districts).toHaveLength(3);
      expect(body.districts[0].district_name).toBe('Dhaka');
    });
  });

  describe('F-13: Authentic 7-Day Analytics, Prior Week Comparison, Provenance & Override Audit', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      resetRateLimits();
    });

    test('Computes real indoor hours and distinct warning days without fake multipliers (no count*2 or min(n,3))', async () => {
      const now = new Date();
      // 3 sessions across 2 distinct days
      const day1 = new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString();
      const day1Session2 = new Date(now.getTime() - 1 * 24 * 3600 * 1000 + 3600 * 1000).toISOString();
      const day2 = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString();
      const day3Safe = new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString();

      const mockItems = [
        // Day 1: 2 indoor sessions of 45 mins each = 90 mins (1.5 hours)
        { timestamp: day1, duration_minutes: 45, readings: { aqi: 160, heat_index_c: 38 }, evaluation: { decision: 'MOVE_INDOORS' }, is_modeled: false },
        { timestamp: day1Session2, duration_minutes: 45, readings: { aqi: 165, heat_index_c: 39 }, evaluation: { decision: 'MOVE_INDOORS' }, is_modeled: false },
        // Day 2: 1 caution session of 45 mins
        { timestamp: day2, duration_minutes: 45, readings: { aqi: 110, heat_index_c: 34 }, evaluation: { decision: 'MODIFY' }, is_modeled: true },
        // Day 3: Safe session
        { timestamp: day3Safe, duration_minutes: 45, readings: { aqi: 45, heat_index_c: 26 }, evaluation: { decision: 'PROCEED' }, is_modeled: false },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return { Items: mockItems } as never;
        }
        if (command.input?.TableName === 'AirSafe-Decisions-dev') {
          return { Items: [] } as never;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/analytics',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      // Total indoor hours: 2 sessions of 45 mins = 90 mins = 1.5 hours (NOT fabricated count*2 = 4!)
      expect(body.lost_outdoor_minutes).toBe(90);
      expect(body.total_indoor_hours).toBe(2); // Math.round(1.5) = 2

      // Warning days: Day 1 and Day 2 (2 distinct days, NOT fabricated min(n, 3) = 3!)
      expect(body.warning_days_count).toBe(2);

      // Provenance: 3 measured, 1 modeled = 75% measured, 25% modeled
      expect(body.measured_ratio_pct).toBe(75);
      expect(body.modeled_ratio_pct).toBe(25);
      expect(body.data_provenance.measured_count).toBe(3);
      expect(body.data_provenance.modeled_count).toBe(1);

      // Total sessions analyzed
      expect(body.total_sessions_analyzed).toBe(4);
      expect(body.safe_sessions_count).toBe(1);
      expect(body.caution_sessions_count).toBe(1);
      expect(body.move_indoors_count).toBe(2);
    });

    test('Computes prior week comparison, delta, and trend direction accurately', async () => {
      const now = new Date();
      // Current week: avg AQI 120
      const current1 = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      const current2 = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString();
      // Prior week (8-13 days ago): avg AQI 150
      const prior1 = new Date(now.getTime() - 9 * 24 * 3600 * 1000).toISOString();
      const prior2 = new Date(now.getTime() - 11 * 24 * 3600 * 1000).toISOString();

      const mockItems = [
        { timestamp: current1, readings: { aqi: 110, heat_index_c: 34 }, evaluation: { decision: 'MODIFY' } },
        { timestamp: current2, readings: { aqi: 130, heat_index_c: 35 }, evaluation: { decision: 'MODIFY' } },
        { timestamp: prior1, readings: { aqi: 140, heat_index_c: 37 }, evaluation: { decision: 'MODIFY' } },
        { timestamp: prior2, readings: { aqi: 160, heat_index_c: 39 }, evaluation: { decision: 'MOVE_INDOORS' } },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return { Items: mockItems } as never;
        }
        return { Items: [] } as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/analytics',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      // Current week avg AQI: (110 + 130) / 2 = 120
      expect(body.avg_aqi).toBe(120);
      // Prior week avg AQI: (140 + 160) / 2 = 150
      expect(body.prior_week.avg_aqi).toBe(150);
      // AQI delta: 120 - 150 = -30 (Improving!)
      expect(body.comparison.aqi_delta).toBe(-30);
      expect(body.comparison.trend_direction).toBe('IMPROVING');
      expect(body.comparison.is_improved).toBe(true);
    });

    test('Audits recorded overrides count and override days from DECISIONS_TABLE_NAME', async () => {
      const now = new Date();
      const day1 = new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const day2 = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const mockOverrides = [
        { activity_id: `OVERRIDE#${day1}#football`, date: day1, requested_decision: 'MOVE_INDOORS', reason: 'Smoke' },
        { activity_id: `OVERRIDE#${day1}#cricket`, date: day1, requested_decision: 'MOVE_INDOORS', reason: 'Dust' },
        { activity_id: `OVERRIDE#${day2}#assembly`, date: day2, requested_decision: 'MODIFY', reason: 'Heat' },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return { Items: [] } as never;
        }
        if (command.input?.TableName === 'AirSafe-Decisions-dev') {
          return { Items: mockOverrides } as never;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/analytics',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.overrides_count).toBe(3);
      expect(body.override_days_count).toBe(2);
    });
  });

  describe('F-04: Trends API (24h/7d/30d, School Hours Shading & Multi-Site Comparison)', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      resetRateLimits();
    });

    test('GET /trends defaults to 24h, formats bilingual labels, and shades school hours (08:00 - 16:00 Asia/Dhaka)', async () => {
      // 03:00 UTC = 09:00 AM Asia/Dhaka (School hours!)
      const schoolHourIso = '2026-10-25T03:00:00.000Z';
      // 13:00 UTC = 19:00 PM Asia/Dhaka (After school hours / evening)
      const afterSchoolIso = '2026-10-25T13:00:00.000Z';

      const mockItems = [
        {
          timestamp: schoolHourIso,
          readings: { temperature_c: 32.5, heat_index_c: 36.8, aqi: 115, pm25_ugm3: 40 },
          evaluation: { decision: 'MODIFY' },
          location_type: 'FIELD',
          sensor_id: 'dhk-001-field-1',
        },
        {
          timestamp: afterSchoolIso,
          readings: { temperature_c: 28.0, heat_index_c: 31.0, aqi: 85, pm25_ugm3: 30 },
          evaluation: { decision: 'PROCEED' },
          location_type: 'FIELD',
          sensor_id: 'dhk-001-field-1',
        },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command.input?.TableName === 'AirSafe-Readings-dev') {
          return { Items: mockItems } as never;
        }
        return {} as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/trends',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.range).toBe('24h');
      expect(body.period_bn).toContain('২৪ ঘণ্টা');
      expect(body.school_hours.is_shaded).toBe(true);
      expect(body.school_hours.start).toBe('08:00');
      expect(body.school_hours.end).toBe('16:00');
      expect(body.points).toHaveLength(2);

      // Point 1: 03:00 UTC = 9:00 AM BST -> School hours shaded!
      const p1 = body.points[0];
      expect(p1.is_school_hours).toBe(true);
      expect(p1.is_shaded).toBe(true);
      expect(p1.time_label_en).toContain('9:00 AM');
      expect(p1.time_label_bn).toContain('সকাল ৯:০০');
      expect(p1.heat_index_c).toBe(36.8);
      expect(p1.aqi).toBe(115);
      expect(p1.is_dangerous).toBe(true);

      // Point 2: 13:00 UTC = 7:00 PM BST -> After school hours
      const p2 = body.points[1];
      expect(p2.is_school_hours).toBe(false);
      expect(p2.is_shaded).toBe(false);
      expect(p2.time_label_en).toContain('7:00 PM');
      expect(p2.time_label_bn).toContain('সন্ধ্যা ৭:০০');
      expect(p2.heat_index_c).toBe(31.0);
      expect(p2.aqi).toBe(85);
      expect(p2.is_dangerous).toBe(false);
    });

    test('GET /trends?range=7d and range=30d supports multi-day ranges', async () => {
      const mockItems = [
        {
          timestamp: '2026-10-20T04:00:00.000Z',
          readings: { temperature_c: 30.0, heat_index_c: 34.0, aqi: 95 },
          evaluation: { decision: 'MODIFY' },
        },
        {
          timestamp: '2026-10-25T04:00:00.000Z',
          readings: { temperature_c: 33.0, heat_index_c: 38.0, aqi: 155 },
          evaluation: { decision: 'MOVE_INDOORS' },
        },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async () => ({ Items: mockItems } as never));

      const res7d = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/trends',
          queryStringParameters: { range: '7d' },
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );
      expect(res7d.statusCode).toBe(200);
      const body7d = JSON.parse(res7d.body);
      expect(body7d.range).toBe('7d');
      expect(body7d.period_en).toContain('7 Days');
      expect(body7d.points).toHaveLength(2);

      const res30d = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/trends',
          queryStringParameters: { range: '30d' },
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );
      expect(res30d.statusCode).toBe(200);
      const body30d = JSON.parse(res30d.body);
      expect(body30d.range).toBe('30d');
      expect(body30d.period_en).toContain('30 Days');
    });

    test('GET /trends?compare_site_id=dhk-001-courtyard compares two sites and computes deltas', async () => {
      const ts = '2026-10-25T04:00:00.000Z'; // 10:00 AM BST
      const mockItems = [
        // Primary Field sensor (hotter, dusty)
        {
          timestamp: ts,
          sensor_id: 'dhk-001-field-1',
          location_type: 'FIELD',
          readings: { temperature_c: 33.0, heat_index_c: 38.5, aqi: 140 },
          evaluation: { decision: 'MOVE_INDOORS' },
        },
        // Comparison Courtyard sensor (shaded, cooler)
        {
          timestamp: ts,
          sensor_id: 'dhk-001-courtyard-1',
          location_type: 'COURTYARD',
          readings: { temperature_c: 29.5, heat_index_c: 32.0, aqi: 90 },
          evaluation: { decision: 'PROCEED' },
        },
      ];

      jest.spyOn(docClient, 'send').mockImplementation(async () => ({ Items: mockItems } as never));

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/trends',
          queryStringParameters: {
            site_id: 'dhk-001-field-1',
            compare_site_id: 'dhk-001-courtyard-1',
          },
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.sites_compared).toEqual(['dhk-001-field-1', 'dhk-001-courtyard-1']);
      expect(body.points).toHaveLength(1);
      expect(body.comparison_points).toHaveLength(1);

      const fieldPoint = body.points[0];
      expect(fieldPoint.heat_index_c).toBe(38.5);
      expect(fieldPoint.aqi).toBe(140);
      expect(fieldPoint.comparison_heat_index_c).toBe(32.0);
      expect(fieldPoint.comparison_aqi).toBe(90);

      // Delta: 38.5 - 32.0 = 6.5°C difference!
      expect(fieldPoint.delta_heat_index_c).toBe(6.5);
      // Delta: 140 - 90 = 50 AQI difference!
      expect(fieldPoint.delta_aqi).toBe(50);
    });
  });

  describe('F-03 (Restored District Baseline and Real-Time Events Fallback)', () => {
    test('GET /sensor-sites restores district public baseline telemetry', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command?.input?.ExpressionAttributeValues?.[':did'] === 'bd-dhaka') {
          return {
            Items: [
              {
                school_id: 'bd-dhaka',
                timestamp: 'LATEST#bd-dhaka',
                readings: { temperature_c: 34.0, relative_humidity_pct: 65, heat_index_c: 38.0, pm25_ugm3: 55.0 },
              },
            ],
          } as never;
        }
        return {
          Items: [
            {
              school_id: 'school-dhaka-001',
              timestamp: new Date().toISOString(),
              readings: { temperature_c: 31.0, relative_humidity_pct: 65, heat_index_c: 35.5, pm25_ugm3: 38.0 },
            },
          ],
        } as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/sensor-sites',
          queryStringParameters: { include_district: 'true' },
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.district_baseline).toBeDefined();
      expect(body.district_baseline.location_type).toBe('DISTRICT');
      expect(body.district_baseline.temp_c).toBe(34.0);
      expect(body.sites.find((s: any) => s.location_type === 'DISTRICT')).toBeDefined();
    });

    test('GET /events returns 200 JSON decision frame by default', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command?.input?.TableName?.includes('Readings')) {
          return {
            Items: [
              {
                school_id: 'school-dhaka-001',
                timestamp: new Date().toISOString(),
                readings: { temperature_c: 31.0, relative_humidity_pct: 65, heat_index_c: 35.5, aqi: 75 },
              },
            ],
          } as never;
        }
        return { Item: null } as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/events',
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.school_id).toBe('school-dhaka-001');
      expect(body.decision).toBeDefined();
    });

    test('GET /events with text/event-stream returns Server-Sent Events stream format', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async (command: any) => {
        if (command?.input?.TableName?.includes('Readings')) {
          return {
            Items: [
              {
                school_id: 'school-dhaka-001',
                timestamp: new Date().toISOString(),
                readings: { temperature_c: 31.0, relative_humidity_pct: 65, heat_index_c: 35.5, aqi: 75 },
              },
            ],
          } as never;
        }
        return { Item: null } as never;
      });

      const res = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/schools/school-dhaka-001/events',
          headers: {
            Authorization: `Bearer ${teacherToken}`,
            Accept: 'text/event-stream',
          },
        })
      );

      expect(res.statusCode).toBe(200);
      expect(res.headers?.['Content-Type']).toBe('text/event-stream');
      expect(res.body).toContain('event: decision\n');
      expect(res.body).toContain('data: {');
    });

    test('CI Regression Guard: "capital of France" and "Can students play football?" MUST NOT produce identical answers', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async () => {
        return {
          Items: [
            {
              school_id: 'school-dhaka-001',
              school_name: 'Dhaka Model School',
              timestamp: new Date().toISOString(),
              is_modeled: false,
              readings: { heat_index_c: 32.0, aqi: 75, pm25_ugm3: 20.0 },
            },
          ],
        } as never;
      });

      // 1. Off-topic query (Capital of France)
      const resOffTopic = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'What is the capital of France?' }),
        })
      );
      expect(resOffTopic.statusCode).toBe(200);
      const offTopicBody = JSON.parse(resOffTopic.body);

      // 2. In-scope permission query (Can students play football now?)
      const resInScope = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'Can students play football now?' }),
        })
      );
      expect(resInScope.statusCode).toBe(200);
      const inScopeBody = JSON.parse(resInScope.body);

      // HARD ASSERTION: answers must NEVER be identical
      expect(offTopicBody.answer).not.toEqual(inScopeBody.answer);

      // HARD ASSERTION: Off-topic must return clear refusal
      expect(offTopicBody.answer).toContain('I can only answer questions related to school air quality, temperature, and outdoor safety.');

      // HARD ASSERTION: In-scope permission query starts with direct Yes/No/Restricted
      expect(
        inScopeBody.answer.startsWith('Yes') ||
        inScopeBody.answer.startsWith('No') ||
        inScopeBody.answer.startsWith('Restricted')
      ).toBe(true);
    });

    test('CI Regression Guard: Bengali off-topic vs outdoor play query differentiation', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async () => {
        return {
          Items: [
            {
              school_id: 'school-dhaka-001',
              school_name: 'Dhaka Model School',
              timestamp: new Date().toISOString(),
              is_modeled: false,
              readings: { heat_index_c: 32.0, aqi: 75, pm25_ugm3: 20.0 },
            },
          ],
        } as never;
      });

      // 1. Bengali off-topic (বাংলাদেশের রাজধানী কী?)
      const resBnOffTopic = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'বাংলাদেশের রাজধানী কী?' }),
        })
      );
      expect(resBnOffTopic.statusCode).toBe(200);
      const bnOffTopicBody = JSON.parse(resBnOffTopic.body);

      // 2. Bengali in-scope (আজ কি বাইরে খেলা যাবে?)
      const resBnInScope = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'আজ কি বাইরে খেলা যাবে?' }),
        })
      );
      expect(resBnInScope.statusCode).toBe(200);
      const bnInScopeBody = JSON.parse(resBnInScope.body);

      expect(bnOffTopicBody.answer).not.toEqual(bnInScopeBody.answer);
      expect(bnOffTopicBody.answer).toContain('আমি শুধু স্কুলের বায়ুমান, তাপমাত্রা ও outdoor নিরাপত্তা নিয়ে উত্তর দিতে পারি।');
      expect(
        bnInScopeBody.answer.startsWith('হ্যাঁ') ||
        bnInScopeBody.answer.startsWith('না') ||
        bnInScopeBody.answer.startsWith('সীমিত')
      ).toBe(true);
    });

    test('Query Type Differentiation: Why question explains reasons, AQI question provides numbers & time', async () => {
      jest.spyOn(docClient, 'send').mockImplementation(async () => {
        return {
          Items: [
            {
              school_id: 'school-dhaka-001',
              school_name: 'Dhaka Model School',
              timestamp: new Date().toISOString(),
              is_modeled: false,
              readings: { heat_index_c: 32.0, aqi: 75, pm25_ugm3: 20.0 },
            },
          ],
        } as never;
      });

      // Why question
      const resWhy = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'What is the current outdoor decision and why?' }),
        })
      );
      const whyBody = JSON.parse(resWhy.body);
      expect(whyBody.answer.toLowerCase()).toMatch(/reason|কারণ/);

      // Poetry off-topic question
      const resPoem = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'Write me a poem about cricket.' }),
        })
      );
      const poemBody = JSON.parse(resPoem.body);
      expect(poemBody.answer).toContain('I can only answer questions related to school air quality');
      expect(poemBody.answer).not.toEqual(whyBody.answer);

      // AQI question
      const resAqi = await handler(
        makeEvent({
          httpMethod: 'POST',
          path: '/schools/school-dhaka-001/assistant/chat',
          headers: { Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ query: 'What is the current AQI?' }),
        })
      );
      const aqiBody = JSON.parse(resAqi.body);
      expect(aqiBody.answer).toContain('AQI 75');
      expect(aqiBody.answer).toContain('BST');
    });
  });
});
