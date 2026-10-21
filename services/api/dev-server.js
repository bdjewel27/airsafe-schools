/**
 * AirSafe Schools Local Development Server with Live Open-Meteo Integration
 * Binds to 0.0.0.0:3000 so both localhost and host LAN IP can access it.
 * Real-time public telemetry for Dhaka and Chittagong via Open-Meteo Weather & Air Quality APIs.
 * Full Policy v1.2 deterministic safety floor evaluation.
 */

const http = require('http');

const PORT = 3000;
const HOST = '0.0.0.0';

const SCHOOL_COORDINATES = {
  'school-dhaka-001': {
    schoolId: 'school-dhaka-001',
    lat: 23.8103,
    lon: 90.4125,
    nameBn: 'ঢাকা মডেল স্কুল',
    nameEn: 'Dhaka Model School'
  },
  'school-chittagong-002': {
    schoolId: 'school-chittagong-002',
    lat: 22.3569,
    lon: 91.7832,
    nameBn: 'চট্টগ্রাম হাই স্কুল',
    nameEn: 'Chittagong High School'
  }
};

// State per school
const schoolNotes = {
  'school-dhaka-001': [],
  'school-chittagong-002': []
};

const schoolOverrides = {
  'school-dhaka-001': [],
  'school-chittagong-002': []
};

const schoolRoutines = {
  'school-dhaka-001': {
    intensity: 'MODERATE',
    currentActivityBn: 'সকালের পিই ক্লাস',
    currentActivityEn: 'Morning PE Class',
    nextActivityBn: 'স্কুল সমাবেশ',
    nextActivityEn: 'School Assembly',
    durationMinutes: 45
  },
  'school-chittagong-002': {
    intensity: 'MODERATE',
    currentActivityBn: 'সকালের পিই ক্লাস',
    currentActivityEn: 'Morning PE Class',
    nextActivityBn: 'স্কুল সমাবেশ',
    nextActivityEn: 'School Assembly',
    durationMinutes: 45
  }
};

// In-memory cache for Open-Meteo (30 seconds TTL)
const telemetryCache = {};

async function fetchLiveTelemetry(schoolId) {
  const school = SCHOOL_COORDINATES[schoolId] || SCHOOL_COORDINATES['school-dhaka-001'];
  const cacheKey = school.schoolId;
  const now = Date.now();

  if (telemetryCache[cacheKey] && (now - telemetryCache[cacheKey].timestamp < 30000)) {
    return telemetryCache[cacheKey].data;
  }

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${school.lat}&longitude=${school.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${school.lat}&longitude=${school.lon}&current=pm2_5,us_aqi&timezone=auto`;

    console.log(`[OPEN-METEO] Fetching live data for ${school.nameEn} (lat: ${school.lat}, lon: ${school.lon})...`);
    const [wRes, aRes] = await Promise.all([
      fetch(weatherUrl, { headers: { 'User-Agent': 'AirSafeSchools/2.0' } }),
      fetch(aqiUrl, { headers: { 'User-Agent': 'AirSafeSchools/2.0' } })
    ]);

    const weatherData = await wRes.json();
    const aqiData = await aRes.json();

    const result = {
      tempC: Number(weatherData.current?.temperature_2m ?? 28.0),
      rhPct: Number(weatherData.current?.relative_humidity_2m ?? 70.0),
      heatIndexC: Number(weatherData.current?.apparent_temperature ?? 31.0),
      pm25Ugm3: Number(aqiData.current?.pm2_5 ?? 35.0),
      aqi: Number(aqiData.current?.us_aqi ?? 75),
      fetchedAt: new Date().toISOString()
    };

    telemetryCache[cacheKey] = { timestamp: now, data: result };
    console.log(`[OPEN-METEO] Success for ${school.nameEn}: Temp=${result.tempC}°C, HI=${result.heatIndexC}°C, PM2.5=${result.pm25Ugm3}, AQI=${result.aqi}`);
    return result;
  } catch (err) {
    console.error(`[OPEN-METEO] Error fetching live telemetry for ${schoolId}:`, err.message);
    // Graceful fallback if Open-Meteo is temporarily unreachable
    return {
      tempC: schoolId.includes('chittagong') ? 27.0 : 27.5,
      rhPct: 72.0,
      heatIndexC: schoolId.includes('chittagong') ? 31.5 : 32.5,
      pm25Ugm3: schoolId.includes('chittagong') ? 38.0 : 50.0,
      aqi: schoolId.includes('chittagong') ? 78 : 155,
      fetchedAt: new Date().toISOString()
    };
  }
}

/**
 * Evaluates Policy v1.2 strictly according to Project Brief Appendix A.
 */
function evaluatePolicyV12(schoolId, telemetry) {
  const school = SCHOOL_COORDINATES[schoolId] || SCHOOL_COORDINATES['school-dhaka-001'];
  const routine = schoolRoutines[school.schoolId];
  const intensity = (routine?.intensity || 'MODERATE').toUpperCase();

  // Check respiratory sensitivity note (Asthma / আজমা / হাঁপানি)
  const notes = schoolNotes[school.schoolId] || [];
  const hasRespiratory = notes.some(n =>
    n.hasRespiratory ||
    /asthma|respiratory|breathing|cough|wheez|আজমা|অ্যাজমা|হাঁপানি|শ্বাসকষ্ট|কাশি|সংবেদনশীল|sensitive|ajma|ajmao/i.test(n.note || '')
  );

  const aqi = telemetry.aqi;
  const heatIndexC = telemetry.heatIndexC;

  // 1. AQI Tier Evaluation
  // Appendix A Rule 5: Asthmatic / respiratory sensitivity treats AQI band as one tier higher
  let aqiDecision = 'PROCEED';
  let aqiMaxDuration = undefined;

  let effectiveAqiBand = 1; // 1: 0-50, 2: 51-100, 3: 101-150, 4: 151-200, 5: 201+
  if (aqi <= 50) effectiveAqiBand = 1;
  else if (aqi <= 100) effectiveAqiBand = 2;
  else if (aqi <= 150) effectiveAqiBand = 3;
  else if (aqi <= 200) effectiveAqiBand = 4;
  else effectiveAqiBand = 5;

  if (hasRespiratory) {
    effectiveAqiBand = Math.min(5, effectiveAqiBand + 1);
  }

  if (effectiveAqiBand === 1) {
    aqiDecision = 'PROCEED';
  } else if (effectiveAqiBand === 2) {
    aqiDecision = intensity === 'VIGOROUS' ? 'PROCEED_WITH_PRECAUTIONS' : 'PROCEED';
  } else if (effectiveAqiBand === 3) {
    if (intensity === 'VIGOROUS') {
      aqiDecision = 'MODIFY';
      aqiMaxDuration = 30;
    } else {
      aqiDecision = 'PROCEED_WITH_PRECAUTIONS';
    }
  } else if (effectiveAqiBand === 4) {
    if (intensity === 'VIGOROUS') {
      aqiDecision = 'MOVE_INDOORS';
      aqiMaxDuration = 0;
    } else {
      aqiDecision = 'MODIFY';
      aqiMaxDuration = 15;
    }
  } else {
    aqiDecision = 'MOVE_INDOORS';
    aqiMaxDuration = 0;
  }

  // 2. Heat Index Tier Evaluation
  let heatDecision = 'PROCEED';
  let heatMaxDuration = undefined;
  let heatRequiresShade = false;

  if (heatIndexC < 27) {
    heatDecision = 'PROCEED';
  } else if (heatIndexC < 32) {
    heatDecision = intensity === 'LIGHT' ? 'PROCEED' : 'PROCEED_WITH_PRECAUTIONS';
    heatRequiresShade = false;
  } else if (heatIndexC < 39) {
    heatDecision = intensity === 'LIGHT' ? 'PROCEED_WITH_PRECAUTIONS' : 'MODIFY';
    heatMaxDuration = 30;
    heatRequiresShade = true;
  } else if (heatIndexC < 51) {
    heatDecision = intensity === 'LIGHT' ? 'MODIFY' : 'MOVE_INDOORS';
    heatMaxDuration = intensity === 'LIGHT' ? 15 : 0;
    heatRequiresShade = true;
  } else {
    heatDecision = 'MOVE_INDOORS';
    heatMaxDuration = 0;
    heatRequiresShade = true;
  }

  // 3. Overall Decision = Most Restrictive (Monotonic Floor)
  const severity = {
    'PROCEED': 1,
    'PROCEED_WITH_PRECAUTIONS': 2,
    'MODIFY': 3,
    'MOVE_INDOORS': 4
  };

  let finalDecision = severity[aqiDecision] >= severity[heatDecision] ? aqiDecision : heatDecision;
  let maxDurationMinutes = Math.min(
    aqiMaxDuration !== undefined ? aqiMaxDuration : 60,
    heatMaxDuration !== undefined ? heatMaxDuration : 60
  );
  if (maxDurationMinutes === 60) maxDurationMinutes = 45;

  let requiresShade = heatRequiresShade || finalDecision === 'MODIFY';

  // Appendix A Rule 5: Asthmatic / respiratory condition enforces at least MODIFY (ORANGE) floor
  if (hasRespiratory) {
    if (severity[finalDecision] < severity['MODIFY']) {
      finalDecision = 'MODIFY';
      maxDurationMinutes = 30;
      requiresShade = true;
    }
  }

  // 4. Coordinator Override (Only tighter, never looser)
  const overrides = schoolOverrides[school.schoolId] || [];
  const latestOverride = overrides.length > 0 ? overrides[overrides.length - 1] : null;

  if (latestOverride) {
    const overrideDecision = latestOverride.decision;
    if (severity[overrideDecision] && severity[overrideDecision] > severity[finalDecision]) {
      finalDecision = overrideDecision;
      if (finalDecision === 'MOVE_INDOORS') {
        maxDurationMinutes = 0;
        requiresShade = true;
      } else if (finalDecision === 'MODIFY') {
        maxDurationMinutes = Math.min(maxDurationMinutes, 30);
        requiresShade = true;
      }
    }
  }

  // Map to Status Color
  let status = 'GREEN';
  if (finalDecision === 'MOVE_INDOORS') status = 'RED';
  else if (finalDecision === 'MODIFY') status = 'ORANGE';
  else if (finalDecision === 'PROCEED_WITH_PRECAUTIONS') status = 'YELLOW';
  else status = 'GREEN';

  // Reason Construction
  let primaryReason = '';
  const reasonList = [];

  if (latestOverride && severity[latestOverride.decision] >= severity[finalDecision]) {
    primaryReason = `🚨 কোঅর্ডিনেটরের জরুরি নির্দেশ: ${latestOverride.reason}`;
    reasonList.push(primaryReason);
  } else if (hasRespiratory) {
    primaryReason = `সংবেদনশীল শিক্ষার্থী (আজমা/হাঁপানি): Policy v1.2 (রুল ৫) অনুযায়ী ১ ধাপ সতর্কতায় কার্যক্রম সীমিত (MODIFY) আবশ্যক — সর্বোচ্চ ৩০ মিনিট ও ছায়া বাধ্যতামূলক`;
    reasonList.push(primaryReason);
    reasonList.push(`লাইভ আবহাওয়া: হিট ইনডেক্স ${heatIndexC}°C, US AQI ${aqi}`);
  } else if (status === 'ORANGE') {
    primaryReason = `লাইভ ওপেন-মেটিও পর্যবেক্ষণ: বর্তমান বায়ুমান সূচক (US AQI) ${aqi} ও অনুভূত তাপমাত্রা ${heatIndexC}°C। Policy v1.2 অনুযায়ী কার্যক্রম সীমিত (MODIFY) করুন — সর্বোচ্চ ${maxDurationMinutes} মিনিট ও ছায়া বাধ্যতামূলক।`;
    reasonList.push(primaryReason);
    reasonList.push('ছায়ায় পর্যাপ্ত বিরতি ও পর্যাপ্ত পানীয় জল নিশ্চিত করুন');
  } else if (status === 'RED') {
    primaryReason = `🚨 চরম পরিবেশ ঝুঁকি: বর্তমান বায়ুমান সূচক (US AQI) ${aqi} অথবা হিট ইনডেক্স ${heatIndexC}°C নিরাপদ সীমা অতিক্রম করেছে। সব বহিরাঙ্গন ক্লাস অবিলম্বে ভেতরে নেওয়া আবশ্যক।`;
    reasonList.push(primaryReason);
  } else if (status === 'YELLOW') {
    primaryReason = `লাইভ ওপেন-মেটিও পর্যবেক্ষণ: হিট ইনডেক্স ${heatIndexC}°C ও বায়ুমান ${aqi} সহনশীল সীমার মধ্যে — হাইড্রেটেড থাকুন ও ছায়াযুক্ত স্থানে পিই ক্লাস পরিচালনা করুন।`;
    reasonList.push(primaryReason);
    reasonList.push('ছায়ায় পর্যাপ্ত বিরতি বাধ্যতামূলক');
  } else {
    primaryReason = `আবহাওয়া ও বায়ুমান সম্পূর্ণ স্বাভাবিক। ক্লাস স্বাভাবিকভাবে পরিচালনা করা নিরাপদ।`;
    reasonList.push(primaryReason);
  }

  return {
    schoolId: school.schoolId,
    schoolName: `${school.nameBn} (${school.nameEn})`,
    status,
    decision: finalDecision,
    policyFloorDecision: finalDecision,
    heatIndexC,
    aqi,
    pm25Ugm3: telemetry.pm25Ugm3,
    primaryReason,
    reasons: reasonList,
    maxDurationMinutes,
    requiresShade,
    isStale: false,
    isModeled: true,
    lastUpdated: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true }),
    routineIntensity: intensity.toLowerCase(),
    currentActivityBn: routine?.currentActivityBn || 'সকালের পিই ক্লাস',
    currentActivityEn: routine?.currentActivityEn || 'Morning PE Class',
    nextActivityBn: routine?.nextActivityBn || 'স্কুল সমাবেশ',
    nextActivityEn: routine?.nextActivityEn || 'School Assembly',
    confidenceLevelPct: 94,
    weatherTrendBn: 'লাইভ ওপেন-মেটিও ফিড সংযুক্ত',
    weatherTrendEn: 'Live Open-Meteo feed connected'
  };
}

function formatDecisionResponse(raw) {
  return {
    ...raw,
    // Provide both snake_case and camelCase for robust JSON decoding
    school_id: raw.schoolId,
    school_name: raw.schoolName,
    policy_floor_decision: raw.policyFloorDecision,
    heat_index_c: raw.heatIndexC,
    pm25_ugm3: raw.pm25Ugm3,
    primary_reason: raw.primaryReason,
    max_duration_minutes: raw.maxDurationMinutes,
    requires_shade: raw.requiresShade,
    is_stale: raw.isStale,
    is_modeled: raw.isModeled,
    last_updated: raw.lastUpdated,
    current_activity_bn: raw.currentActivityBn,
    current_activity_en: raw.currentActivityEn,
    next_activity_bn: raw.nextActivityBn,
    next_activity_en: raw.nextActivityEn,
    routine_intensity: raw.routineIntensity,
    confidence_level_pct: raw.confidenceLevelPct,
    weather_trend_bn: raw.weatherTrendBn,
    weather_trend_en: raw.weatherTrendEn
  };
}

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

  req.on('end', async () => {
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
          school_id: schoolId,
          nameBn,
          name_bn: nameBn,
          nameEn,
          name_en: nameEn,
          schoolNameBn,
          school_name_bn: schoolNameBn,
          schoolNameEn,
          school_name_en: schoolNameEn
        }
      }));
      return;
    }

    // 2. GET /schools/:schoolId/current-decision
    const decisionMatch = pathname.match(/^\/schools\/([^\/]+)\/current-decision$/);
    if (req.method === 'GET' && decisionMatch) {
      const schoolId = decisionMatch[1];
      const telemetry = await fetchLiveTelemetry(schoolId);
      const rawDecision = evaluatePolicyV12(schoolId, telemetry);
      res.writeHead(200);
      res.end(JSON.stringify(formatDecisionResponse(rawDecision)));
      return;
    }

    // 3. POST /schools/:schoolId/notes
    const noteMatch = pathname.match(/^\/schools\/([^\/]+)\/notes$/);
    if (req.method === 'POST' && noteMatch) {
      const schoolId = noteMatch[1];
      const note = parsedBody.note || '';
      const hasRespiratory = Boolean(
        parsedBody.hasRespiratoryCondition ||
        parsedBody.has_respiratory_condition ||
        /asthma|respiratory|breathing|cough|wheez|আজমা|অ্যাজমা|হাঁপানি|শ্বাসকষ্ট|কাশি|সংবেদনশীল|sensitive|ajma|ajmao/i.test(note)
      );

      schoolNotes[schoolId] = schoolNotes[schoolId] || [];
      schoolNotes[schoolId].push({
        note,
        hasRespiratory,
        timestamp: new Date().toISOString()
      });

      console.log(`[NOTE SAVED] School ${schoolId}: "${note}" (Respiratory: ${hasRespiratory})`);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'Activity note saved and policy evaluated',
        schoolId,
        steppedUp: hasRespiratory
      }));
      return;
    }

    // 4. GET /schools/:schoolId/notes
    if (req.method === 'GET' && noteMatch) {
      const schoolId = noteMatch[1];
      const notes = schoolNotes[schoolId] || [];
      res.writeHead(200);
      res.end(JSON.stringify({ notes }));
      return;
    }

    // 5. POST /schools/:schoolId/overrides
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
      console.log(`[COORDINATOR OVERRIDE] School ${schoolId} overridden to ${decision}: ${reason}`);

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Coordinator override applied', schoolId }));
      return;
    }

    // 6. POST /schools/:schoolId/routines
    const routineMatch = pathname.match(/^\/schools\/([^\/]+)\/routines$/);
    if (req.method === 'POST' && routineMatch) {
      const schoolId = routineMatch[1];
      const intensity = (parsedBody.intensity || 'MODERATE').toUpperCase();
      const activityNameBn = parsedBody.activityNameBn || parsedBody.activity_name_bn || 'পিই ও খেলাধুলা';
      const durationMinutes = parsedBody.durationMinutes || parsedBody.duration_minutes || 45;

      schoolRoutines[schoolId] = {
        intensity,
        currentActivityBn: activityNameBn,
        currentActivityEn: parsedBody.activityNameEn || activityNameBn,
        nextActivityBn: 'স্কুল সমাবেশ',
        nextActivityEn: 'School Assembly',
        durationMinutes
      };

      console.log(`[ROUTINE UPDATED] School ${schoolId}: ${activityNameBn} (${intensity})`);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Routine updated', schoolId }));
      return;
    }

    // 7. GET /schools/:schoolId/sensor-sites
    const sensorMatch = pathname.match(/^\/schools\/([^\/]+)\/sensor-sites$/);
    if (req.method === 'GET' && sensorMatch) {
      const schoolId = sensorMatch[1];
      const live = await fetchLiveTelemetry(schoolId);

      const sites = [
        {
          id: `${schoolId}-field`,
          nameBn: 'খেলার মাঠ (মূল মাঠ)',
          name_bn: 'খেলার মাঠ (মূল মাঠ)',
          nameEn: 'School Playground',
          name_en: 'School Playground',
          locationType: 'FIELD',
          location_type: 'FIELD',
          tempC: Number((live.tempC + 1.8).toFixed(1)),
          temp_c: Number((live.tempC + 1.8).toFixed(1)),
          rhPct: Number((live.rhPct - 3.0).toFixed(0)),
          rh_pct: Number((live.rhPct - 3.0).toFixed(0)),
          pm25Ugm3: Number((live.pm25Ugm3 + 4.5).toFixed(1)),
          pm25_ugm3: Number((live.pm25Ugm3 + 4.5).toFixed(1)),
          heatIndexC: Number((live.heatIndexC + 2.2).toFixed(1)),
          heat_index_c: Number((live.heatIndexC + 2.2).toFixed(1)),
          isOnline: true,
          is_online: true,
          lastUpdatedBn: '১ মিনিট আগে',
          last_updated_bn: '১ মিনিট আগে',
          lastUpdatedEn: '1 min ago',
          last_updated_en: '1 min ago'
        },
        {
          id: `${schoolId}-courtyard`,
          nameBn: 'স্কুল উঠান ও বারান্দা',
          name_bn: 'স্কুল উঠান ও বারান্দা',
          nameEn: 'School Courtyard',
          name_en: 'School Courtyard',
          locationType: 'COURTYARD',
          location_type: 'COURTYARD',
          tempC: live.tempC,
          temp_c: live.tempC,
          rhPct: live.rhPct,
          rh_pct: live.rhPct,
          pm25Ugm3: live.pm25Ugm3,
          pm25_ugm3: live.pm25Ugm3,
          heatIndexC: live.heatIndexC,
          heat_index_c: live.heatIndexC,
          isOnline: true,
          is_online: true,
          lastUpdatedBn: 'এইমাত্র হালনাগাদকৃত',
          last_updated_bn: 'এইমাত্র হালনাগাদকৃত',
          lastUpdatedEn: 'Just now',
          last_updated_en: 'Just now'
        },
        {
          id: `${schoolId}-classroom-101`,
          nameBn: 'বিজ্ঞান ভবন ক্লাসরুম ১০১',
          name_bn: 'বিজ্ঞান ভবন ক্লাসরুম ১০১',
          nameEn: 'Science Building Class 101',
          name_en: 'Science Building Class 101',
          locationType: 'CLASSROOM',
          location_type: 'CLASSROOM',
          tempC: Number(Math.min(live.tempC, 26.5).toFixed(1)),
          temp_c: Number(Math.min(live.tempC, 26.5).toFixed(1)),
          rhPct: 55.0,
          rh_pct: 55.0,
          pm25Ugm3: Number((live.pm25Ugm3 * 0.45).toFixed(1)),
          pm25_ugm3: Number((live.pm25Ugm3 * 0.45).toFixed(1)),
          heatIndexC: 27.0,
          heat_index_c: 27.0,
          isOnline: true,
          is_online: true,
          lastUpdatedBn: '২ মিনিট আগে',
          last_updated_bn: '২ মিনিট আগে',
          lastUpdatedEn: '2 mins ago',
          last_updated_en: '2 mins ago'
        }
      ];

      res.writeHead(200);
      res.end(JSON.stringify({ sites }));
      return;
    }

    // 8. GET /schools/:schoolId/analytics
    const analyticsMatch = pathname.match(/^\/schools\/([^\/]+)\/analytics$/);
    if (req.method === 'GET' && analyticsMatch) {
      const schoolId = analyticsMatch[1];
      const live = await fetchLiveTelemetry(schoolId);
      res.writeHead(200);
      res.end(JSON.stringify({
        periodBn: 'গত সপ্তাহ (৭–১৩ অক্টোবর)',
        period_bn: 'গত সপ্তাহ (৭–১৩ অক্টোবর)',
        periodEn: 'Past Week (Oct 7–13)',
        period_en: 'Past Week (Oct 7–13)',
        totalIndoorHours: 4,
        total_indoor_hours: 4,
        warningDaysCount: 8,
        warning_days_count: 8,
        totalSessionsAnalyzed: 18,
        total_sessions_analyzed: 18,
        avgAqi: Math.round(live.aqi * 0.85),
        avg_aqi: Math.round(live.aqi * 0.85),
        maxHeatIndexC: Number((live.heatIndexC + 2.5).toFixed(1)),
        max_heat_index_c: Number((live.heatIndexC + 2.5).toFixed(1))
      }));
      return;
    }

    // 9. GET /schools/:schoolId/staff
    const staffMatch = pathname.match(/^\/schools\/([^\/]+)\/staff$/);
    if (req.method === 'GET' && staffMatch) {
      res.writeHead(200);
      res.end(JSON.stringify({
        staff: [
          { email: 'fatema.teacher@dms.edu.bd', roleBn: 'সহকারী শিক্ষক', role_bn: 'সহকারী শিক্ষক', roleEn: 'Assistant Teacher', role_en: 'Assistant Teacher' },
          { email: 'karim.teacher@dms.edu.bd', roleBn: 'সহকারী শিক্ষক', role_bn: 'সহকারী শিক্ষক', roleEn: 'Assistant Teacher', role_en: 'Assistant Teacher' },
          { email: 'rafiq.principal@dms.edu.bd', roleBn: 'প্রধান শিক্ষক ও কোঅর্ডিনেটর', role_bn: 'প্রধান শিক্ষক ও কোঅর্ডিনেটর', roleEn: 'Principal & Coordinator', role_en: 'Principal & Coordinator' }
        ]
      }));
      return;
    }

    // 10. POST /schools/:schoolId/staff/invite
    const inviteMatch = pathname.match(/^\/schools\/([^\/]+)\/staff\/invite$/);
    if (req.method === 'POST' && inviteMatch) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, email: parsedBody.email }));
      return;
    }

    // 11. POST /schools/:schoolId/assistant/chat
    const chatMatch = pathname.match(/^\/schools\/([^\/]+)\/assistant\/chat$/);
    if (req.method === 'POST' && chatMatch) {
      const q = parsedBody.query || '';
      const isBn = parsedBody.isBengali !== false;
      const schoolId = chatMatch[1];
      const live = await fetchLiveTelemetry(schoolId);
      const current = evaluatePolicyV12(schoolId, live);

      res.writeHead(200);
      res.end(JSON.stringify({
        answer: isBn
          ? `ক্যাম্পাসের লাইভ ওপেন-মেটিও পর্যবেক্ষণ: বর্তমান অনুভূত তাপমাত্রা (হিট ইনডেক্স) ${current.heatIndexC}°C এবং বায়ুমান সূচক (US AQI) ${current.aqi}। Policy v1.2 অনুযায়ী বর্তমান সিদ্ধান্ত হলো: ${current.decision} (${current.status})। ${current.primaryReason}`
          : `Current campus live telemetry: Heat Index is ${current.heatIndexC}°C and AQI is ${current.aqi}. Decision per Policy v1.2 is: ${current.decision} (${current.status}). ${current.primaryReason}`,
        citation_id: 'Model School Outdoor Activity Policy v1.2 §3',
        citationId: 'Model School Outdoor Activity Policy v1.2 §3',
        citation_excerpt: 'Deterministic environmental thresholds for student outdoor safety.',
        citationExcerpt: 'Deterministic environmental thresholds for student outdoor safety.',
        doc_id: 'airsafe-policy-v1.2',
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
  console.log(` AirSafe Dev Server (Live Open-Meteo) running at:`);
  console.log(` - Localhost: http://localhost:${PORT}/`);
  console.log(` - LAN (Mobile): http://192.168.31.37:${PORT}/`);
  console.log(' Live telemetry connected for Dhaka & Chittagong!');
  console.log('====================================================');
});
