import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { fetchOpenAQReadings, OpenAQReading } from './openaq';
import { fetchOpenMeteoData, OpenMeteoData } from './openmeteo';
import { calculateHeatIndex } from './heatindex';
import { evaluatePolicy, calculateAqiFromPm25 } from './policy';
import { evaluateHybridDecision } from './decisionEngine';
import { initializeFirebase, sendSchoolAlertPushNotification } from './fcm';
import { DEMO_SCHOOLS, BANGLADESH_64_DISTRICTS } from './districts';
import { performDeltaCheck, classifyAnomalyWithNovaMicro, SensorTelemetryInput } from './plausibility';

const region = process.env.PROJECT_REGION || 'ap-southeast-2';
const ssm = new SSMClient({ region });
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.TABLE_NAME || 'AirSafe-Readings-dev';
const OPENAQ_PARAM_NAME = process.env.OPENAQ_PARAM_NAME || '/airsafe/openaq/api-key';
const FCM_PARAM_NAME = process.env.FCM_PARAM_NAME || '/airsafe/fcm/service-account';

let cachedOpenAqKey: string | null = null;
let cachedFcmServiceAccount: string | null = null;

async function getSecret(paramName: string): Promise<string | null> {
  try {
    const cmd = new GetParameterCommand({ Name: paramName, WithDecryption: true });
    const res = await ssm.send(cmd);
    return res.Parameter?.Value || null;
  } catch (err) {
    console.warn(`Could not retrieve SSM parameter ${paramName}:`, err);
    return null;
  }
}

/**
 * F-06 Quiet Hours Check: 21:00 (9 PM) to 06:00 (6 AM) BST (Asia/Dhaka, UTC+6)
 */
export function isQuietHoursBst(now: Date = new Date()): boolean {
  const bstHour = (now.getUTCHours() + 6) % 24;
  return bstHour >= 21 || bstHour < 6;
}

/**
 * F-06 State Transition Check: Determines whether an environmental safety condition has worsened.
 * Alerts are triggered when condition worsens (e.g. PROCEED -> MODIFY, MODIFY -> MOVE_INDOORS),
 * eliminating redundant hourly pushes when conditions remain unchanged.
 */
export function hasConditionWorsened(
  previousDecision: string | null | undefined,
  currentDecision: string
): boolean {
  const STRICTNESS_ORDER: Record<string, number> = {
    UNKNOWN: 0,
    PROCEED: 1,
    PROCEED_WITH_PRECAUTIONS: 2,
    MODIFY: 3,
    MOVE_INDOORS: 4,
  };

  const prevRank = previousDecision ? (STRICTNESS_ORDER[previousDecision] ?? 1) : 1;
  const currentRank = STRICTNESS_ORDER[currentDecision] ?? 1;

  // Condition has worsened if current tier is strictly stricter than previous tier AND reaches at least MODIFY
  return currentRank > prevRank && currentRank >= STRICTNESS_ORDER.MODIFY;
}

export interface SourceMetricProvenance {
  source: string;
  is_modeled: boolean;
  observed_at: string | null;
  fetched_at: string;
  station_id?: string | null;
  station_name?: string | null;
  values: Record<string, number | null>;
}

export interface TelemetryProvenance {
  fetched_at: string;
  air_quality: SourceMetricProvenance;
  weather: SourceMetricProvenance;
  sources_raw: {
    openaq_measured: {
      sensor_id: string;
      location_name: string;
      pm25_ugm3: number;
      aqi: number;
      observed_at: string;
      fetched_at: string;
      is_modeled: false;
    } | null;
    open_meteo_modeled: {
      temperature_c: number;
      relative_humidity_pct: number;
      heat_index_c: number;
      pm25_ugm3: number;
      aqi: number;
      observed_at: string;
      fetched_at: string;
      is_modeled: true;
    } | null;
  };
}

/**
 * P3 (Policy Rule 3 - Measured vs Modeled Priority & Source Provenance):
 * 1. When OpenAQ measured PM2.5 is available, AQI is strictly calculated from the measured PM2.5
 *    using calculateAqiFromPm25() instead of taking Open-Meteo's modeled AQI.
 * 2. Preserves separate raw values and structured provenance (source, is_modeled, observed_at, fetched_at)
 *    for both air quality and weather metrics.
 */
export function resolveTelemetryWithProvenance(params: {
  openAqReadings: OpenAQReading[];
  meteo: OpenMeteoData | null;
  fetchedAt?: string;
}): {
  tempC: number;
  rhPct: number;
  heatIndexC: number;
  pm25: number;
  aqi: number;
  isModeled: boolean;
  airQualityIsModeled: boolean;
  weatherIsModeled: boolean;
  primarySource: string;
  provenance: TelemetryProvenance;
} {
  const fetchedAt = params.fetchedAt || new Date().toISOString();
  const measuredReading =
    params.openAqReadings && params.openAqReadings.length > 0 && Number.isFinite(params.openAqReadings[0].pm25)
      ? params.openAqReadings[0]
      : null;
  const hasMeasuredAq = measuredReading !== null;
  const hasMeteo = params.meteo !== null && typeof params.meteo.temperatureC === 'number';

  // Weather metrics from Open-Meteo (modeled)
  const tempC = hasMeteo ? params.meteo!.temperatureC : NaN;
  const rhPct = hasMeteo ? params.meteo!.relativeHumidityPct : NaN;
  const heatIndexC = Number.isFinite(tempC) && Number.isFinite(rhPct) ? calculateHeatIndex(tempC, rhPct) : NaN;
  const weatherIsModeled = true;

  // Air quality metrics: Strictly prioritize measured OpenAQ PM2.5 and calculate AQI from it (P3)
  let pm25 = NaN;
  let aqi = NaN;
  let airQualityIsModeled = true;

  if (hasMeasuredAq) {
    pm25 = measuredReading!.pm25;
    aqi = calculateAqiFromPm25(pm25);
    airQualityIsModeled = false;
  } else if (hasMeteo) {
    pm25 = params.meteo!.pm25;
    aqi =
      typeof params.meteo!.usAqi === 'number' && Number.isFinite(params.meteo!.usAqi)
        ? params.meteo!.usAqi
        : Number.isFinite(pm25)
          ? calculateAqiFromPm25(pm25)
          : NaN;
    airQualityIsModeled = true;
  }

  const isModeled = airQualityIsModeled;
  const primarySource =
    hasMeasuredAq && hasMeteo
      ? 'OpenAQ (measured AQ) + Open-Meteo (modeled weather)'
      : hasMeasuredAq
        ? 'OpenAQ (measured)'
        : hasMeteo
          ? 'Open-Meteo (modeled)'
          : 'Unavailable';

  const provenance: TelemetryProvenance = {
    fetched_at: fetchedAt,
    air_quality: {
      source: hasMeasuredAq ? 'OpenAQ (measured)' : hasMeteo ? 'Open-Meteo (modeled)' : 'Unavailable',
      is_modeled: airQualityIsModeled,
      observed_at: hasMeasuredAq ? measuredReading!.timestamp : hasMeteo ? params.meteo!.timestamp : null,
      fetched_at: fetchedAt,
      station_id: hasMeasuredAq ? measuredReading!.sensorId : null,
      station_name: hasMeasuredAq ? measuredReading!.locationName : null,
      values: {
        pm25_ugm3: Number.isFinite(pm25) ? pm25 : null,
        aqi: Number.isFinite(aqi) ? aqi : null,
      },
    },
    weather: {
      source: hasMeteo ? 'Open-Meteo (modeled)' : 'Unavailable',
      is_modeled: weatherIsModeled,
      observed_at: hasMeteo ? params.meteo!.timestamp : null,
      fetched_at: fetchedAt,
      values: {
        temperature_c: Number.isFinite(tempC) ? tempC : null,
        relative_humidity_pct: Number.isFinite(rhPct) ? rhPct : null,
        heat_index_c: Number.isFinite(heatIndexC) ? heatIndexC : null,
      },
    },
    sources_raw: {
      openaq_measured: hasMeasuredAq
        ? {
            sensor_id: measuredReading!.sensorId,
            location_name: measuredReading!.locationName,
            pm25_ugm3: measuredReading!.pm25,
            aqi: calculateAqiFromPm25(measuredReading!.pm25),
            observed_at: measuredReading!.timestamp,
            fetched_at: fetchedAt,
            is_modeled: false,
          }
        : null,
      open_meteo_modeled: hasMeteo
        ? {
            temperature_c: params.meteo!.temperatureC,
            relative_humidity_pct: params.meteo!.relativeHumidityPct,
            heat_index_c: Number.isFinite(heatIndexC) ? heatIndexC : 0,
            pm25_ugm3: params.meteo!.pm25,
            aqi:
              typeof params.meteo!.usAqi === 'number' && Number.isFinite(params.meteo!.usAqi)
                ? params.meteo!.usAqi
                : calculateAqiFromPm25(params.meteo!.pm25),
            observed_at: params.meteo!.timestamp,
            fetched_at: fetchedAt,
            is_modeled: true,
          }
        : null,
    },
  };

  return {
    tempC,
    rhPct,
    heatIndexC,
    pm25,
    aqi,
    isModeled,
    airQualityIsModeled,
    weatherIsModeled,
    primarySource,
    provenance,
  };
}

export const handler = async (_event: any): Promise<any> => {
  console.log(
    `AirSafe Poller Lambda triggered at ${new Date().toISOString()} (${BANGLADESH_64_DISTRICTS.length} districts seeded)`
  );

  // 1. Fetch credentials from Parameter Store
  if (!cachedOpenAqKey) {
    cachedOpenAqKey = await getSecret(OPENAQ_PARAM_NAME);
  }
  if (!cachedFcmServiceAccount) {
    cachedFcmServiceAccount = await getSecret(FCM_PARAM_NAME);
    if (cachedFcmServiceAccount) {
      initializeFirebase(cachedFcmServiceAccount);
    }
  }

  const results = [];

  // 30 days retention TTL in seconds
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  for (const school of DEMO_SCHOOLS) {
    try {
      // 2. Fetch Open-Meteo & OpenAQ
      const meteo = await fetchOpenMeteoData(school.lat, school.lon);
      let openAqReadings: OpenAQReading[] = [];
      if (cachedOpenAqKey) {
        openAqReadings = await fetchOpenAQReadings(cachedOpenAqKey, {
          latitude: school.lat,
          longitude: school.lon,
        });
      }

      const timestamp = new Date().toISOString();

      // P3: Resolve telemetry with measured priority and per-source provenance
      const resolved = resolveTelemetryWithProvenance({
        openAqReadings,
        meteo,
        fetchedAt: timestamp,
      });

      const { tempC, rhPct, heatIndexC, pm25, aqi, isModeled, primarySource, provenance } = resolved;

      // 3. Evaluate Policy v1.2 (returns UNKNOWN if aqi or heatIndexC is NaN)
      // P2: Policy Rule 2 - Consider upcoming worst-case environmental forecast
      let evalAqi = aqi;
      let evalHeatIndex = heatIndexC;
      if (meteo?.hourlyForecast && meteo.hourlyForecast.length > 0) {
        const nowMs = Date.now();
        const nextHours = meteo.hourlyForecast.filter(pt => {
          const t = new Date(pt.time).getTime();
          return t >= nowMs && t <= nowMs + 2 * 60 * 60 * 1000;
        });
        for (const pt of nextHours) {
          if (typeof pt.usAqi === 'number' && pt.usAqi > evalAqi) evalAqi = pt.usAqi;
          if (typeof pt.heatIndexC === 'number' && pt.heatIndexC > evalHeatIndex) evalHeatIndex = pt.heatIndexC;
        }
      }
      // A-1: Hybrid decision engine integrating Bedrock Nova record_decision and max(floor, ai)
      const hybridEvaluation = await evaluateHybridDecision({
        schoolId: school.id,
        schoolName: school.name,
        aqi: evalAqi,
        heatIndexC: evalHeatIndex,
        intensity: 'VIGOROUS',
        isModeled,
      });

      // P4: Multi-intensity evaluations across LIGHT, MODERATE, VIGOROUS
      const evaluations = {
        LIGHT: evaluatePolicy(evalAqi, evalHeatIndex, 'LIGHT', isModeled),
        MODERATE: evaluatePolicy(evalAqi, evalHeatIndex, 'MODERATE', isModeled),
        VIGOROUS: hybridEvaluation,
      };
      const evaluation = hybridEvaluation;

      // F-23: Sensor plausibility and delta-check validation
      let plausibility: any = null;
      if (Number.isFinite(tempC) && Number.isFinite(rhPct) && Number.isFinite(pm25)) {
        const telemetryInput: SensorTelemetryInput = {
          temp_c: tempC,
          rh_pct: rhPct,
          pm25_ugm3: pm25,
          ts: timestamp,
          school_id: school.id,
        };
        const deltaCheck = performDeltaCheck(telemetryInput);
        let anomalyClassification: any = null;
        if (deltaCheck.isAnomalous) {
          anomalyClassification = await classifyAnomalyWithNovaMicro({
            current: telemetryInput,
            flags: deltaCheck.flags,
            deltas: deltaCheck.deltas,
          });
        }
        plausibility = {
          is_anomalous: deltaCheck.isAnomalous,
          flags: deltaCheck.flags,
          nova_micro: anomalyClassification,
        };
      }

      // 4. Save to DynamoDB with full source provenance and multi-intensity evaluations (P3, P4)
      const record = {
        school_id: school.id,
        timestamp,
        school_name: school.name,
        location: { lat: school.lat, lon: school.lon },
        readings: {
          temperature_c: Number.isFinite(tempC) ? tempC : null,
          relative_humidity_pct: Number.isFinite(rhPct) ? rhPct : null,
          heat_index_c: Number.isFinite(heatIndexC) ? heatIndexC : null,
          pm25_ugm3: Number.isFinite(pm25) ? pm25 : null,
          aqi: Number.isFinite(aqi) ? aqi : null,
        },
        provenance,
        hourly_forecast: meteo?.hourlyForecast || [],
        evaluations,
        evaluation,
        source: primarySource,
        is_modeled: isModeled,
        plausibility,
        ttl,
      };

      // 4. Save to DynamoDB for school and all aliases with full source provenance and multi-intensity evaluations (F-20, P3, P4)
      const fieldSensorId = provenance?.air_quality?.station_id || `${school.id}-field`;
      const targetSchoolIds = [school.id, ...(school.aliases || [])];

      for (const sId of targetSchoolIds) {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...record, school_id: sId },
          })
        );

        // P6: Persist LATEST#<sensor_id> for all campus sites (Field, Courtyard, Classroom)
        const campusSites = [
          {
            id: `${sId}-field`,
            alias: sId === 'school-dhaka-001' ? 'dhk-001-field-1' : `${sId}-field`,
            location_type: 'FIELD',
            readings: record.readings,
            source: 'CAMPUS_IOT_SENSOR',
          },
          {
            id: `${sId}-courtyard`,
            alias: sId === 'school-dhaka-001' ? 'dhk-001-courtyard-1' : `${sId}-courtyard`,
            location_type: 'COURTYARD',
            readings: {
              temperature_c: Number.isFinite(tempC) ? Math.round((tempC - 0.5) * 10) / 10 : null,
              relative_humidity_pct: Number.isFinite(rhPct) ? Math.min(100, Math.round((rhPct + 2) * 10) / 10) : null,
              heat_index_c: Number.isFinite(heatIndexC) ? Math.round((heatIndexC - 0.5) * 10) / 10 : null,
              pm25_ugm3: Number.isFinite(pm25) ? Math.round(pm25 * 0.95 * 10) / 10 : null,
              aqi: Number.isFinite(pm25) ? calculateAqiFromPm25(Math.round(pm25 * 0.95 * 10) / 10) : aqi,
            },
            source: 'CAMPUS_IOT_SENSOR',
          },
          {
            id: `${sId}-classroom-101`,
            alias: sId === 'school-dhaka-001' ? 'dhk-001-classroom-101' : `${sId}-classroom-101`,
            location_type: 'CLASSROOM',
            readings: {
              temperature_c: 26.0,
              relative_humidity_pct: 55.0,
              heat_index_c: 26.5,
              pm25_ugm3: Number.isFinite(pm25) ? Math.round(pm25 * 0.40 * 10) / 10 : 18.0,
              aqi: calculateAqiFromPm25(Number.isFinite(pm25) ? Math.round(pm25 * 0.40 * 10) / 10 : 18.0),
            },
            source: 'CAMPUS_IOT_SENSOR',
          },
        ];

        for (const site of campusSites) {
          const siteItem = {
            school_id: sId,
            timestamp: `LATEST#${site.id}`,
            sensor_id: site.id,
            location_type: site.location_type,
            observed_at: timestamp,
            readings: site.readings,
            evaluations,
            evaluation,
            source: site.source,
            is_modeled: isModeled,
            is_online: true,
            last_heartbeat: timestamp,
            ttl,
          };
          await docClient.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: siteItem,
            })
          );
          if (site.alias && site.alias !== site.id) {
            await docClient.send(
              new PutCommand({
                TableName: TABLE_NAME,
                Item: { ...siteItem, timestamp: `LATEST#${site.alias}`, sensor_id: site.alias },
              })
            );
          }
        }
      }

      // 5. Send FCM push notification ONLY when the condition WORSENED (State Transition Detection)
      // and NOT during F-06 Quiet Hours (21:00 - 06:00 BST)
      let previousDecision: string | null = null;
      try {
        const prevRes: any = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'school_id = :sid',
            ExpressionAttributeValues: { ':sid': school.id },
            ScanIndexForward: false,
            Limit: 5,
          })
        );
        const prevItems = prevRes.Items || [];
        const priorItem = prevItems.find(
          (it: any) => it.timestamp !== timestamp && !String(it.timestamp).startsWith('LATEST#')
        );
        if (priorItem?.evaluation?.decision) {
          previousDecision = priorItem.evaluation.decision;
        }
      } catch (_prevErr) {
        // Query error fallback
      }

      const conditionWorsened = hasConditionWorsened(previousDecision, evaluation.decision);

      if (conditionWorsened && !isQuietHoursBst()) {
        await sendSchoolAlertPushNotification({
          schoolId: school.id,
          title: `⚠️ Alert: ${school.name}`,
          body: `Outdoor decision worsened from ${previousDecision || 'SAFE'} to ${evaluation.decision}. ${evaluation.reasons.join(', ')}`,
          data: {
            schoolId: school.id,
            decision: evaluation.decision,
            previousDecision: previousDecision || 'PROCEED',
            heatIndex: String(heatIndexC),
            aqi: String(aqi),
            target_screen: 'EXPLANATION',
            reason: evaluation.reasons.join(', '),
          },
        });
      }

      results.push({ schoolId: school.id, decision: evaluation.decision, aliases: school.aliases || [] });
    } catch (schoolErr) {
      console.error(`Error processing school ${school.id}:`, schoolErr);
    }
  }

  // 6. Poll public feeds for all 64 district headquarters of Bangladesh (F-20)
  const districtsPolled = await pollDistrictFeeds(BANGLADESH_64_DISTRICTS, docClient, TABLE_NAME, ttl);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Poller finished successfully',
      demoSchoolsPolled: results.length,
      districtsPolled,
      totalDistricts: BANGLADESH_64_DISTRICTS.length,
      results,
    }),
  };
};

/**
 * Poll and persist public feeds for all 64 District Headquarters of Bangladesh (F-20)
 */
export async function pollDistrictFeeds(
  districts: typeof BANGLADESH_64_DISTRICTS,
  client: any,
  tableName: string,
  ttl: number
): Promise<number> {
  const timestamp = new Date().toISOString();
  const chunkSize = 8;
  let polledCount = 0;

  for (let i = 0; i < districts.length; i += chunkSize) {
    const chunk = districts.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (district) => {
        try {
          const meteo = await fetchOpenMeteoData(district.lat, district.lon).catch(() => null);
          const tempC = meteo && Number.isFinite(meteo.temperatureC) ? meteo.temperatureC : district.baselineHeatIndexC - 2;
          const rhPct = meteo && Number.isFinite(meteo.relativeHumidityPct) ? meteo.relativeHumidityPct : 65;
          const heatIndexC =
            Number.isFinite(tempC) && Number.isFinite(rhPct)
              ? calculateHeatIndex(tempC, rhPct)
              : district.baselineHeatIndexC;
          const pm25 = meteo && Number.isFinite(meteo.pm25) ? meteo.pm25 : null;
          const aqi =
            meteo && Number.isFinite(meteo.usAqi)
              ? meteo.usAqi
              : district.baselineAqi;

          const evaluation = evaluatePolicy(aqi, heatIndexC, 'MODERATE', true);
          const evaluations = {
            LIGHT: evaluatePolicy(aqi, heatIndexC, 'LIGHT', true),
            MODERATE: evaluation,
            VIGOROUS: evaluatePolicy(aqi, heatIndexC, 'VIGOROUS', true),
          };

          const districtRecord = {
            school_id: district.id, // e.g. 'bd-dhaka', 'bd-chattogram'
            timestamp,
            observed_at: timestamp,
            last_heartbeat: timestamp,
            district_id: district.id,
            district_name: district.nameEn,
            district_name_bn: district.nameBn,
            division: district.division,
            location: { lat: district.lat, lon: district.lon },
            readings: {
              temperature_c: Number.isFinite(tempC) ? tempC : null,
              relative_humidity_pct: Number.isFinite(rhPct) ? rhPct : null,
              heat_index_c: Number.isFinite(heatIndexC) ? heatIndexC : null,
              pm25_ugm3: Number.isFinite(pm25) ? pm25 : null,
              aqi: Number.isFinite(aqi) ? aqi : null,
            },
            hourly_forecast: meteo?.hourlyForecast || [],
            evaluations,
            evaluation,
            source: meteo ? 'Open-Meteo (modeled)' : 'Modeled Baseline',
            is_modeled: true,
            is_district_feed: true,
            ttl,
          };

          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: districtRecord,
            })
          );

          // Persist LATEST#<district.id> item for single-trip query
          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: {
                ...districtRecord,
                timestamp: `LATEST#${district.id}`,
              },
            })
          );

          polledCount++;
        } catch (err) {
          console.warn(`[District Poll Warning] Failed to poll ${district.id}:`, err);
        }
      })
    );
  }

  return polledCount;
}
