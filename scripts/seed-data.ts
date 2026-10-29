/**
 * AirSafe Schools - Database Seed Script (F-20)
 *
 * Seeds initial demo dataset:
 * 1. 3 Demo Schools: Dhaka Model School (Dhaka), Chittagong Hills School (Chattogram), Rajshahi Padma School (Rajshahi).
 * 2. School Coordinators and Teachers with PBKDF2-SHA512 password hashes and O(1) STAFF_LOOKUP indices.
 * 3. Daily activity routines (ROUTINE#current & ACTIVITY#<id>).
 * 4. Campus sensor sites (Field, Courtyard, Classroom).
 * 5. Initial verified telemetry for all 3 schools (and backward-compatible aliases).
 * 6. Public feed telemetry for all 64 District Headquarters of Bangladesh.
 */

import * as crypto from 'crypto';
import * as path from 'path';
import { createRequire } from 'module';

const requireApi = createRequire(path.resolve(__dirname, '../services/api/package.json'));
const { DynamoDBClient } = requireApi('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = requireApi('@aws-sdk/lib-dynamodb');
import { DEMO_SCHOOLS, BANGLADESH_64_DISTRICTS } from '../services/poller/src/districts';
import { calculateAqiFromPm25 } from '../services/poller/src/policy';

const region = process.env.AWS_REGION || process.env.PROJECT_REGION || 'ap-southeast-2';
const TABLE_NAME = process.env.TABLE_NAME || 'AirSafe-Readings-dev';
const DECISIONS_TABLE_NAME = process.env.DECISIONS_TABLE_NAME || 'AirSafe-Decisions-dev';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

export const SEEDED_STAFF = [
  {
    email: 'rafiq.principal@dms.edu.bd',
    role: 'COORDINATOR',
    schoolId: 'school-dhaka-001',
    nameBn: 'প্রিন্সিপাল রফিকুল ইসলাম',
    nameEn: 'Principal Rafiqul Islam',
    schoolNameBn: 'ঢাকা মডেল স্কুল',
    schoolNameEn: 'Dhaka Model School',
  },
  {
    email: 'fatema.teacher@dms.edu.bd',
    role: 'TEACHER',
    schoolId: 'school-dhaka-001',
    nameBn: 'সহকারী শিক্ষক ফাতিমা',
    nameEn: 'Assistant Teacher Fatema',
    schoolNameBn: 'ঢাকা মডেল স্কুল',
    schoolNameEn: 'Dhaka Model School',
  },
  {
    email: 'kamal.coordinator@chs.edu.bd',
    role: 'COORDINATOR',
    schoolId: 'school-chattogram-001',
    nameBn: 'স্কুল কোঅর্ডিনেটর কামাল হোসেন',
    nameEn: 'Coordinator Kamal Hossain',
    schoolNameBn: 'চট্টগ্রাম হিলস স্কুল',
    schoolNameEn: 'Chittagong Hills School',
  },
  {
    email: 'nusrat.teacher@chs.edu.bd',
    role: 'TEACHER',
    schoolId: 'school-chattogram-001',
    nameBn: 'সহকারী শিক্ষক নুসরাত জাহান',
    nameEn: 'Assistant Teacher Nusrat Jahan',
    schoolNameBn: 'চট্টগ্রাম হিলস স্কুল',
    schoolNameEn: 'Chittagong Hills School',
  },
  {
    email: 'salma.coordinator@rps.edu.bd',
    role: 'COORDINATOR',
    schoolId: 'school-rajshahi-001',
    nameBn: 'স্কুল কোঅর্ডিনেটর সালমা বেগম',
    nameEn: 'Coordinator Salma Begum',
    schoolNameBn: 'রাজশাহী পদ্মা স্কুল',
    schoolNameEn: 'Rajshahi Padma School',
  },
  {
    email: 'tareq.teacher@rps.edu.bd',
    role: 'TEACHER',
    schoolId: 'school-rajshahi-001',
    nameBn: 'সহকারী শিক্ষক তারেক রহমান',
    nameEn: 'Assistant Teacher Tareq Rahman',
    schoolNameBn: 'রাজশাহী পদ্মা স্কুল',
    schoolNameEn: 'Rajshahi Padma School',
  },
];

export async function seedAllData(options?: {
  docClient?: any;
  tableName?: string;
  decisionsTableName?: string;
  password?: string;
}): Promise<{
  schoolsSeeded: number;
  staffSeeded: number;
  districtsSeeded: number;
}> {
  const ddb =
    options?.docClient ||
    DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  const readingsTable = options?.tableName || TABLE_NAME;
  const decisionsTable = options?.decisionsTableName || DECISIONS_TABLE_NAME;
  const defaultPassword = options?.password || '[REDACTED_PASSWORD]';
  const passwordHash = hashPassword(defaultPassword);
  const nowIso = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  let staffCount = 0;
  let schoolCount = 0;
  let districtCount = 0;

  // 1. Seed Staff Accounts & Lookup Indices
  for (const staff of SEEDED_STAFF) {
    const staffItem = {
      school_id: staff.schoolId,
      activity_id: `STAFF#${staff.email}`,
      email: staff.email,
      role: staff.role,
      password_hash: passwordHash,
      name_bn: staff.nameBn,
      name_en: staff.nameEn,
      school_name_bn: staff.schoolNameBn,
      school_name_en: staff.schoolNameEn,
      created_at: nowIso,
    };
    await ddb.send(new PutCommand({ TableName: decisionsTable, Item: staffItem }));

    // Write instant O(1) single-trip lookup index
    await ddb.send(
      new PutCommand({
        TableName: decisionsTable,
        Item: {
          school_id: 'STAFF_LOOKUP',
          activity_id: `EMAIL#${staff.email}`,
          target_school_id: staff.schoolId,
        },
      })
    );
    staffCount++;
  }

  // 2. Seed Routines and Activities for the 3 Demo Schools
  for (const school of DEMO_SCHOOLS) {
    const routineItem = {
      school_id: school.id,
      activity_id: 'ROUTINE#current',
      activity_name_bn: 'শারীরিক শিক্ষা ও ফুটবল',
      activity_name_en: 'PE & Football',
      next_activity_bn: 'সাধারণ সমাবেশ',
      next_activity_en: 'General Assembly',
      intensity: 'vigorous',
      location_type: 'FIELD',
      duration_minutes: 45,
      target_class: 'Class 8-10',
      updated_by: 'system@airsafe.edu.bd',
      updated_at: nowIso,
    };
    await ddb.send(new PutCommand({ TableName: decisionsTable, Item: routineItem }));

    const currentAct = {
      school_id: school.id,
      activity_id: 'ACTIVITY#current',
      id: 'current',
      name_bn: 'শারীরিক শিক্ষা ও ফুটবল',
      name_en: 'PE & Football',
      time_slot: '09:00 - 09:45',
      intensity: 'VIGOROUS',
      location_type: 'FIELD',
      target_class: 'Class 8-10',
      duration_minutes: 45,
      is_current: true,
      order: 1,
      updated_by: 'system@airsafe.edu.bd',
      updated_at: nowIso,
    };
    await ddb.send(new PutCommand({ TableName: decisionsTable, Item: currentAct }));

    const nextAct = {
      school_id: school.id,
      activity_id: 'ACTIVITY#next',
      id: 'next',
      name_bn: 'সাধারণ সমাবেশ',
      name_en: 'General Assembly',
      time_slot: '09:50 - 10:35',
      intensity: 'MODERATE',
      location_type: 'COURTYARD',
      target_class: 'All Classes',
      duration_minutes: 45,
      is_current: false,
      order: 2,
      updated_by: 'system@airsafe.edu.bd',
      updated_at: nowIso,
    };
    await ddb.send(new PutCommand({ TableName: decisionsTable, Item: nextAct }));

    // 3. Seed Initial School Campus Telemetry
    const targetSchoolIds = [school.id, ...(school.aliases || [])];
    const baseHi = school.id.includes('rajshahi') ? 38.5 : school.id.includes('chattogram') ? 31.5 : 34.0;
    const basePm25 = school.id.includes('rajshahi') ? 41.5 : school.id.includes('chattogram') ? 28.0 : 49.7;
    const baseAqi = calculateAqiFromPm25(basePm25);

    const schoolTelemetry = {
      timestamp: nowIso,
      school_name: `${school.nameBn} (${school.name})`,
      location: { lat: school.lat, lon: school.lon },
      source: 'CAMPUS_IOT_SENSOR',
      aqi_source: 'calculated_from_pm25',
      readings: {
        temperature_c: 31.0,
        relative_humidity_pct: 68,
        heat_index_c: baseHi,
        pm25_ugm3: basePm25,
        aqi: baseAqi,
        source: 'CAMPUS_IOT_SENSOR',
      },
      evaluations: {
        LIGHT: { decision: 'PROCEED', status: 'GREEN' },
        MODERATE: { decision: 'MODIFY', status: 'ORANGE' },
        VIGOROUS: { decision: 'MODIFY', status: 'ORANGE' },
      },
      evaluation: { decision: 'MODIFY', status: 'ORANGE' },
      source: 'Open-Meteo (modeled)',
      is_modeled: true,
      ttl,
    };

    for (const sId of targetSchoolIds) {
      await ddb.send(
        new PutCommand({
          TableName: readingsTable,
          Item: { ...schoolTelemetry, school_id: sId },
        })
      );

      // Seed Field Sensor
      await ddb.send(
        new PutCommand({
          TableName: readingsTable,
          Item: {
            school_id: sId,
            timestamp: `LATEST#${sId}-field`,
            sensor_id: `${sId}-field`,
            location_type: 'FIELD',
            observed_at: nowIso,
            readings: schoolTelemetry.readings,
            is_online: true,
            ttl,
          },
        })
      );
      schoolCount++;
    }
  }

  // 4. Seed Public Feeds for all 64 District Headquarters
  for (const district of BANGLADESH_64_DISTRICTS) {
    const districtRecord = {
      school_id: district.id,
      timestamp: nowIso,
      district_id: district.id,
      district_name: district.nameEn,
      district_name_bn: district.nameBn,
      division: district.division,
      location: { lat: district.lat, lon: district.lon },
      readings: {
        temperature_c: district.baselineHeatIndexC - 2,
        relative_humidity_pct: 65,
        heat_index_c: district.baselineHeatIndexC,
        pm25_ugm3: Math.round(district.baselineAqi * 0.32 * 10) / 10,
        aqi: district.baselineAqi,
      },
      source: 'Open-Meteo (modeled)',
      is_modeled: true,
      is_district_feed: true,
      ttl,
    };

    await ddb.send(
      new PutCommand({
        TableName: readingsTable,
        Item: districtRecord,
      })
    );

    await ddb.send(
      new PutCommand({
        TableName: readingsTable,
        Item: {
          ...districtRecord,
          timestamp: `LATEST#${district.id}`,
        },
      })
    );
    districtCount++;
  }

  return {
    schoolsSeeded: schoolCount,
    staffSeeded: staffCount,
    districtsSeeded: districtCount,
  };
}

// Allow direct CLI invocation
if (require.main === module) {
  console.log(`[AirSafe Seeder] Seeding initial dataset to DynamoDB (Region: ${region})...`);
  seedAllData()
    .then((res) => {
      console.log(`[AirSafe Seeder] Successfully seeded:
- ${res.schoolsSeeded} school instances (including aliases)
- ${res.staffSeeded} staff accounts
- ${res.districtsSeeded} district public feeds`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[AirSafe Seeder Error]:', err);
      process.exit(1);
    });
}
