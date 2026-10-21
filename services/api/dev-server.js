/**
 * AirSafe Schools Local Development Server
 * Binds to 0.0.0.0:3000 so both localhost and host LAN IP (e.g. http://192.168.31.37:3000) can access it.
 * Zero external dependencies — runs directly with `node dev-server.js`.
 */

const http = require('http');

const PORT = 3000;
const HOST = '0.0.0.0';

// In-memory tenant decision states
const schoolDecisions = {
  'school-dhaka-001': {
    schoolId: 'school-dhaka-001',
    schoolName: 'ঢাকা মডেল স্কুল (Dhaka Model School)',
    status: 'YELLOW',
    decision: 'PROCEED_WITH_PRECAUTIONS',
    policyFloorDecision: 'PROCEED_WITH_PRECAUTIONS',
    heatIndexC: 33.1,
    aqi: 78,
    pm25Ugm3: 38.5,
    primaryReason: 'হিট ইনডেক্স ও বায়ুমান সহনশীল সীমার মধ্যে — হাইড্রেটেড থাকুন ও ছায়াযুক্ত স্থানে পিই ক্লাস পরিচালনা করুন',
    reasons: [
      'হিট ইনডেক্স ও বায়ুমান সহনশীল সীমার মধ্যে — হাইড্রেটেড থাকুন ও ছায়াযুক্ত স্থানে পিই ক্লাস পরিচালনা করুন',
      'ছায়ায় পর্যাপ্ত বিরতি বাধ্যতামূলক'
    ],
    maxDurationMinutes: 45,
    requiresShade: true,
    isStale: false,
    isModeled: true,
    lastUpdated: new Date().toISOString(),
    routineIntensity: 'moderate',
    currentActivityBn: 'সকালের পিই ক্লাস',
    currentActivityEn: 'Morning PE Class',
    nextActivityBn: 'স্কুল সমাবেশ',
    nextActivityEn: 'School Assembly',
    confidenceLevelPct: 92,
    weatherTrendBn: 'বর্তমান পূর্বাভাস স্থিতিশীল',
    weatherTrendEn: 'Forecast conditions stable'
  },
  'school-chittagong-002': {
    schoolId: 'school-chittagong-002',
    schoolName: 'চট্টগ্রাম হাই স্কুল (Chittagong High School)',
    status: 'YELLOW',
    decision: 'PROCEED_WITH_PRECAUTIONS',
    policyFloorDecision: 'PROCEED_WITH_PRECAUTIONS',
    heatIndexC: 31.8,
    aqi: 65,
    pm25Ugm3: 31.0,
    primaryReason: 'উপকূলীয় আর্দ্রতা বৃদ্ধি পেলেও পরিবেশ সহনশীল সীমার মধ্যে রয়েছে।',
    reasons: [
      'উপকূলীয় আর্দ্রতা বৃদ্ধি পেলেও পরিবেশ সহনশীল সীমার মধ্যে রয়েছে।',
      'ছায়ায় পর্যাপ্ত বিরতি বাধ্যতামূলক'
    ],
    maxDurationMinutes: 45,
    requiresShade: true,
    isStale: false,
    isModeled: false,
    lastUpdated: new Date().toISOString(),
    routineIntensity: 'moderate',
    currentActivityBn: 'সকালের পিই ক্লাস',
    currentActivityEn: 'Morning PE Class',
    nextActivityBn: 'স্কুল সমাবেশ',
    nextActivityEn: 'School Assembly',
    confidenceLevelPct: 88,
    weatherTrendBn: 'বর্তমান পূর্বাভাস স্থিতিশীল',
    weatherTrendEn: 'Forecast conditions stable'
  }
};

const schoolNotes = {
  'school-dhaka-001': [],
  'school-chittagong-002': []
};

const schoolOverrides = {
  'school-dhaka-001': [],
  'school-chittagong-002': []
};

const sensorSitesData = {
  'school-dhaka-001': [
    {
      id: 'dhaka-field',
      nameBn: 'খেলার মাঠ (মূল মাঠ)',
      nameEn: 'School Playground',
      locationType: 'FIELD',
      tempC: 31.5,
      rhPct: 68.0,
      pm25Ugm3: 42.0,
      heatIndexC: 36.2,
      isOnline: true,
      lastUpdatedBn: '১ মিনিট আগে',
      lastUpdatedEn: '1 min ago'
    },
    {
      id: 'dhaka-courtyard',
      nameBn: 'স্কুল উঠান ও বারান্দা',
      nameEn: 'School Courtyard',
      locationType: 'COURTYARD',
      tempC: 29.8,
      rhPct: 70.0,
      pm25Ugm3: 38.5,
      heatIndexC: 33.1,
      isOnline: true,
      lastUpdatedBn: '৩ মিনিট আগে',
      lastUpdatedEn: '3 mins ago'
    },
    {
      id: 'dhaka-classroom-101',
      nameBn: 'বিজ্ঞান ভবন ক্লাসরুম ১০১',
      nameEn: 'Science Building Class 101',
      locationType: 'CLASSROOM',
      tempC: 26.5,
      rhPct: 55.0,
      pm25Ugm3: 18.0,
      heatIndexC: 27.0,
      isOnline: true,
      lastUpdatedBn: '২ মিনিট আগে',
      lastUpdatedEn: '2 mins ago'
    }
  ]
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-school-id');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  console.log(`[HTTP] ${req.method} ${pathname}`);

  let bodyData = '';
  req.on('data', chunk => {
    bodyData += chunk;
  });

  req.on('end', () => {
    let parsedBody = {};
    if (bodyData) {
      try {
        parsedBody = JSON.parse(bodyData);
      } catch (err) {
        console.warn('JSON parse warning:', err.message);
      }
    }

    // 1. POST /auth/login
    if (req.method === 'POST' && pathname === '/auth/login') {
      const email = (parsedBody.email || '').trim().toLowerCase();
      const password = parsedBody.password || '';

      if (!email || !password) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Email and password required' }));
        return;
      }

      const isCoordinator = email.includes('principal') || email.includes('coordinator');
      const role = isCoordinator ? 'COORDINATOR' : 'TEACHER';
      const isChittagong = email.includes('chs.edu.bd') || email.includes('chittagong');
      const schoolId = isChittagong ? 'school-chittagong-002' : 'school-dhaka-001';
      const schoolNameBn = isChittagong ? 'চট্টগ্রাম হাই স্কুল' : 'ঢাকা মডেল স্কুল';
      const schoolNameEn = isChittagong ? 'Chittagong High School' : 'Dhaka Model School';
      const nameBn = isCoordinator ? 'প্রিন্সিপাল রফিক' : 'সহকারী শিক্ষক ফাতিমা';
      const nameEn = isCoordinator ? 'Principal Rafiq' : 'Assistant Teacher Fatema';

      res.writeHead(200);
      res.end(JSON.stringify({
        token: `mock-jwt-token-${email}-${Date.now()}`,
        user: {
          email,
          role,
          schoolId,
          nameBn,
          nameEn,
          schoolNameBn,
          schoolNameEn
        }
      }));
      return;
    }

    // 2. GET /schools/:schoolId/current-decision
    const decisionMatch = pathname.match(/^\/schools\/([^\/]+)\/current-decision$/);
    if (req.method === 'GET' && decisionMatch) {
      const schoolId = decisionMatch[1];
      const decision = schoolDecisions[schoolId] || schoolDecisions['school-dhaka-001'];
      res.writeHead(200);
      res.end(JSON.stringify(decision));
      return;
    }

    // 3. POST /schools/:schoolId/notes
    const noteMatch = pathname.match(/^\/schools\/([^\/]+)\/notes$/);
    if (req.method === 'POST' && noteMatch) {
      const schoolId = noteMatch[1];
      const note = parsedBody.note || '';
      const hasRespiratory = Boolean(parsedBody.hasRespiratoryCondition);

      schoolNotes[schoolId] = schoolNotes[schoolId] || [];
      schoolNotes[schoolId].push({ note, hasRespiratory, timestamp: new Date().toISOString() });

      // Policy v1.2 Rule 5: If respiratory note is reported, step up from YELLOW to MODIFY (ORANGE)
      if (hasRespiratory && schoolDecisions[schoolId]) {
        schoolDecisions[schoolId].status = 'ORANGE';
        schoolDecisions[schoolId].decision = 'MODIFY';
        schoolDecisions[schoolId].policyFloorDecision = 'MODIFY';
        schoolDecisions[schoolId].primaryReason =
          'সংবেদনশীল শিক্ষার্থী (আজমা/হাঁপানি): Policy v1.2 (রুল ৫) অনুযায়ী ১ ধাপ সতর্কতায় কার্যক্রম পরিবর্তন (MODIFY) আবশ্যক — সর্বোচ্চ ৩০ মিনিট ও ছায়া বাধ্যতামূলক';
        schoolDecisions[schoolId].maxDurationMinutes = 30;
        schoolDecisions[schoolId].requiresShade = true;
        schoolDecisions[schoolId].lastUpdated = new Date().toISOString();
        console.log(`[DECISION STEP-UP] School ${schoolId} stepped up to ORANGE (MODIFY) due to asthma note`);
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'Activity note saved and policy evaluated',
        schoolId,
        steppedUp: hasRespiratory
      }));
      return;
    }

    // 4. POST /schools/:schoolId/overrides
    const overrideMatch = pathname.match(/^\/schools\/([^\/]+)\/overrides$/);
    if (req.method === 'POST' && overrideMatch) {
      const schoolId = overrideMatch[1];
      const decision = parsedBody.decision || 'MOVE_INDOORS';
      const reason = parsedBody.reason || '';

      if (reason.length < 5) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Override reason must be at least 5 characters' }));
        return;
      }

      schoolOverrides[schoolId] = schoolOverrides[schoolId] || [];
      schoolOverrides[schoolId].push({ decision, reason, timestamp: new Date().toISOString() });

      if (schoolDecisions[schoolId]) {
        if (decision.includes('MOVE_INDOORS')) {
          schoolDecisions[schoolId].status = 'RED';
          schoolDecisions[schoolId].decision = 'MOVE_INDOORS';
          schoolDecisions[schoolId].policyFloorDecision = 'MOVE_INDOORS';
          schoolDecisions[schoolId].primaryReason = `🚨 জরুরি ওভাররাইড (ভেতরে নেওয়া আবশ্যক): ${reason}`;
          schoolDecisions[schoolId].maxDurationMinutes = 0;
        } else if (decision.includes('MODIFY')) {
          schoolDecisions[schoolId].status = 'ORANGE';
          schoolDecisions[schoolId].decision = 'MODIFY';
          schoolDecisions[schoolId].policyFloorDecision = 'MODIFY';
          schoolDecisions[schoolId].primaryReason = `কোঅর্ডিনেটর ওভাররাইড (কার্যক্রম পরিবর্তন): ${reason}`;
          schoolDecisions[schoolId].maxDurationMinutes = 30;
        }
        schoolDecisions[schoolId].lastUpdated = new Date().toISOString();
        console.log(`[COORDINATOR OVERRIDE] School ${schoolId} overridden to ${schoolDecisions[schoolId].status}`);
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Coordinator override applied', schoolId }));
      return;
    }

    // 5. POST /schools/:schoolId/routines
    const routineMatch = pathname.match(/^\/schools\/([^\/]+)\/routines$/);
    if (req.method === 'POST' && routineMatch) {
      const schoolId = routineMatch[1];
      const intensity = (parsedBody.intensity || 'MODERATE').toUpperCase();
      const activityNameBn = parsedBody.activityNameBn || 'পিই ও খেলাধুলা';
      const durationMinutes = parsedBody.durationMinutes || 45;

      if (schoolDecisions[schoolId]) {
        schoolDecisions[schoolId].currentActivityBn = activityNameBn;
        schoolDecisions[schoolId].routineIntensity = intensity.toLowerCase();
        if (intensity === 'VIGOROUS' && schoolDecisions[schoolId].status === 'YELLOW') {
          schoolDecisions[schoolId].status = 'ORANGE';
          schoolDecisions[schoolId].decision = 'MODIFY';
          schoolDecisions[schoolId].maxDurationMinutes = 30;
          schoolDecisions[schoolId].primaryReason =
            'তীব্র শারীরিক কসরত (Vigorous Activity): Policy v1.2 অনুযায়ী সতর্কতা বৃদ্ধি — সর্বোচ্চ ৩০ মিনিট ও ছায়া বাধ্যতামূলক';
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Routine updated', schoolId }));
      return;
    }

    // 6. GET /schools/:schoolId/sensor-sites
    const sensorMatch = pathname.match(/^\/schools\/([^\/]+)\/sensor-sites$/);
    if (req.method === 'GET' && sensorMatch) {
      const schoolId = sensorMatch[1];
      const sites = sensorSitesData[schoolId] || sensorSitesData['school-dhaka-001'];
      res.writeHead(200);
      res.end(JSON.stringify({ sites }));
      return;
    }

    // 7. GET /schools/:schoolId/analytics
    const analyticsMatch = pathname.match(/^\/schools\/([^\/]+)\/analytics$/);
    if (req.method === 'GET' && analyticsMatch) {
      res.writeHead(200);
      res.end(JSON.stringify({
        periodBn: 'গত সপ্তাহ (৭–১৩ অক্টোবর)',
        periodEn: 'Past Week (Oct 7–13)',
        totalIndoorHours: 4,
        warningDaysCount: 8,
        totalSessionsAnalyzed: 18
      }));
      return;
    }

    // 8. GET /schools/:schoolId/staff
    const staffMatch = pathname.match(/^\/schools\/([^\/]+)\/staff$/);
    if (req.method === 'GET' && staffMatch) {
      res.writeHead(200);
      res.end(JSON.stringify({
        staff: [
          { email: 'fatema.teacher@dms.edu.bd', roleBn: 'সহকারী শিক্ষক', roleEn: 'Assistant Teacher' },
          { email: 'karim.teacher@dms.edu.bd', roleBn: 'সহকারী শিক্ষক', roleEn: 'Assistant Teacher' },
          { email: 'rafiq.principal@dms.edu.bd', roleBn: 'প্রধান শিক্ষক ও কোঅর্ডিনেটর', roleEn: 'Principal & Coordinator' }
        ]
      }));
      return;
    }

    // 9. POST /schools/:schoolId/staff/invite
    const inviteMatch = pathname.match(/^\/schools\/([^\/]+)\/staff\/invite$/);
    if (req.method === 'POST' && inviteMatch) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, email: parsedBody.email }));
      return;
    }

    // 10. POST /schools/:schoolId/assistant/chat
    const chatMatch = pathname.match(/^\/schools\/([^\/]+)\/assistant\/chat$/);
    if (req.method === 'POST' && chatMatch) {
      const q = parsedBody.query || '';
      const isBn = parsedBody.isBengali !== false;
      const schoolId = chatMatch[1];
      const current = schoolDecisions[schoolId] || schoolDecisions['school-dhaka-001'];

      res.writeHead(200);
      res.end(JSON.stringify({
        answer: isBn
          ? `ক্যাম্পাসের বর্তমান আবহাওয়া তথ্য: হিট ইনডেক্স ${current.heatIndexC}°C এবং AQI ${current.aqi}। Policy v1.2 অনুযায়ী বর্তমান সিদ্ধান্ত হলো: ${current.decision}। ${current.primaryReason}`
          : `Current campus telemetry: Heat Index is ${current.heatIndexC}°C and AQI is ${current.aqi}. Decision per Policy v1.2 is: ${current.decision}. ${current.primaryReason}`,
        citationId: 'Model School Outdoor Activity Policy v1.2 §3',
        citationExcerpt: 'Deterministic environmental thresholds for student outdoor safety.',
        docId: 'airsafe-policy-v1.2'
      }));
      return;
    }

    // Default 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: `Endpoint not found: ${req.method} ${pathname}` }));
  });
});

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(` AirSafe Dev Server running at:`);
  console.log(` - Localhost: http://localhost:${PORT}/`);
  console.log(` - LAN (Mobile): http://192.168.31.37:${PORT}/`);
  console.log(' Ready to receive connections from Android devices!');
  console.log('====================================================');
});
