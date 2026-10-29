#!/usr/bin/env node
/**
 * AirSafe Schools - Post-Deploy Live Smoke Test for AI Assistant Off-Topic Guard
 * 
 * Verifies that the deployed API properly rejects out-of-scope / off-topic queries
 * (e.g. trivia, poetry, non-school questions) with a clean refusal instead of returning
 * fallback outdoor activity decisions.
 * 
 * Exits with code 1 to fail the pipeline if any off-topic question does not return a refusal.
 */

const https = require('https');
const { URL } = require('url');

const API_BASE_URL = process.env.API_BASE_URL || 'https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev';
const SCHOOL_ID = process.env.SCHOOL_ID || 'school-dhaka-001';

const OFF_TOPIC_TEST_CASES = [
  {
    id: 'SMOKE-OFFTOPIC-01',
    question: 'What is the capital of France?',
    isBengali: false,
    expectedRefusalPhrase: 'I can only answer questions related to school air quality',
  },
  {
    id: 'SMOKE-OFFTOPIC-02',
    question: 'Write me a poem about cricket.',
    isBengali: false,
    expectedRefusalPhrase: 'I can only answer questions related to school air quality',
  },
  {
    id: 'SMOKE-OFFTOPIC-03',
    question: 'বাংলাদেশের রাজধানী কী?',
    isBengali: true,
    expectedRefusalPhrase: 'আমি শুধু স্কুলের বায়ুমান, তাপমাত্রা ও outdoor নিরাপত্তা নিয়ে উত্তর দিতে পারি',
  },
];

function request(urlStr, options, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function getAuthToken() {
  const loginUrl = `${API_BASE_URL}/auth/login`;
  const credentials = {
    email: 'rafiq.principal@dms.edu.bd',
    password: '[REDACTED_PASSWORD]',
  };

  const res = await request(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, credentials);

  if (res.statusCode !== 200) {
    throw new Error(`Auth failed with status ${res.statusCode}: ${res.body}`);
  }

  const parsed = JSON.parse(res.body);
  if (!parsed.token) {
    throw new Error(`No token returned in auth response: ${res.body}`);
  }

  return parsed.token;
}

async function runSmokeTests() {
  console.log('========================================================================');
  console.log('🔍 RUNNING POST-DEPLOY LIVE SMOKE TEST: AI ASSISTANT OFF-TOPIC REFUSAL');
  console.log(`Target: ${API_BASE_URL}`);
  console.log('========================================================================\n');

  let token;
  try {
    token = await getAuthToken();
    console.log('✅ Authenticated successfully as Principal/Coordinator.');
  } catch (err) {
    console.warn(`⚠️ Live authentication unavailable (${err.message}). Testing via handler or local invocation if configured.`);
    // If running in environment with handler import
    try {
      const { createSignedJwt } = require('../services/api/dist/index');
      token = createSignedJwt({
        email: 'rafiq.principal@dms.edu.bd',
        school_id: SCHOOL_ID,
        role: 'COORDINATOR',
      });
      console.log('✅ Generated signed JWT for smoke test.');
    } catch {
      throw err;
    }
  }

  let failedCount = 0;

  for (const tc of OFF_TOPIC_TEST_CASES) {
    const chatUrl = `${API_BASE_URL}/schools/${SCHOOL_ID}/assistant/chat`;
    const payload = {
      query: tc.question,
      isBengali: tc.isBengali,
    };

    try {
      const res = await request(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }, payload);

      if (res.statusCode !== 200) {
        console.error(`❌ [${tc.id}] Failed with HTTP status ${res.statusCode}: ${res.body}`);
        failedCount++;
        continue;
      }

      const body = JSON.parse(res.body);
      const answer = body.answer || '';

      const isRefusal = answer.includes(tc.expectedRefusalPhrase);
      const isUnwantedPolicyFallback = answer.includes('Current session: PE & Football') ||
                                       answer.includes('বর্তমান সেশন: শারীরিক শিক্ষা ও ফুটবল');

      if (isRefusal && !isUnwantedPolicyFallback) {
        console.log(`✅ [${tc.id}] Question: "${tc.question}"`);
        console.log(`   Response: "${answer}" (Proper refusal received)`);
      } else {
        console.error(`❌ [${tc.id}] FAIL: Expected refusal message not received!`);
        console.error(`   Question: "${tc.question}"`);
        console.error(`   Received Answer: "${answer}"`);
        console.error(`   Expected to contain: "${tc.expectedRefusalPhrase}"`);
        failedCount++;
      }
    } catch (err) {
      console.error(`❌ [${tc.id}] Request error: ${err.message}`);
      failedCount++;
    }
  }

  console.log('\n------------------------------------------------------------------------');
  if (failedCount === 0) {
    console.log(`✅ ALL ${OFF_TOPIC_TEST_CASES.length} POST-DEPLOY SMOKE TESTS PASSED! Off-topic refusal is live and active.`);
    console.log('------------------------------------------------------------------------\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failedCount}/${OFF_TOPIC_TEST_CASES.length} SMOKE TESTS FAILED. Pipeline stopped.`);
    console.log('------------------------------------------------------------------------\n');
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error('Fatal error during smoke test:', err);
  process.exit(1);
});
