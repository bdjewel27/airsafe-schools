import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { fetchOpenAQReadings } from './openaq';
import { fetchOpenMeteoData } from './openmeteo';
import { calculateHeatIndex } from './heatindex';
import { evaluatePolicy } from './policy';
import { initializeFirebase, sendSchoolAlertPushNotification } from './fcm';
import { DEMO_SCHOOLS, BANGLADESH_64_DISTRICTS } from './districts';

const region = process.env.PROJECT_REGION || 'ap-southeast-2';
const ssm = new SSMClient({ region });
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);

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
 * F-06 Quiet Hours Check: 20:00 (8 PM) to 06:00 (6 AM) BST (Asia/Dhaka, UTC+6)
 */
export function isQuietHoursBst(now: Date = new Date()): boolean {
  const bstHour = (now.getUTCHours() + 6) % 24;
  return bstHour >= 20 || bstHour < 6;
}

export const handler = async (event: any): Promise<any> => {
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
      let openAqReadings: any[] = [];
      if (cachedOpenAqKey) {
        openAqReadings = await fetchOpenAQReadings(cachedOpenAqKey, {
          latitude: school.lat,
          longitude: school.lon,
        });
      }

      const hasMeasured = openAqReadings.length > 0;
      const hasMeteo = meteo !== null && typeof meteo.temperatureC === 'number';

      // Hard Gate 4: Fail-Closed when both measured and modeled feeds fail (never fabricate numbers!)
      const tempC = hasMeteo ? meteo!.temperatureC : NaN;
      const rhPct = hasMeteo ? meteo!.relativeHumidityPct : NaN;
      const heatIndexC = Number.isFinite(tempC) && Number.isFinite(rhPct) ? calculateHeatIndex(tempC, rhPct) : NaN;
      const pm25 = hasMeasured ? openAqReadings[0].pm25 : (hasMeteo ? meteo!.pm25 : NaN);
      const aqi = hasMeteo && typeof meteo!.usAqi === 'number' ? meteo!.usAqi : NaN;
      const isModeled = !hasMeasured;

      // 3. Evaluate Policy v1.2 (returns UNKNOWN if aqi or heatIndexC is NaN)
      const evaluation = evaluatePolicy(aqi, heatIndexC, 'VIGOROUS', isModeled);

      const timestamp = new Date().toISOString();

      // 4. Save to DynamoDB
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
        evaluation,
        source: hasMeasured ? 'OpenAQ (measured)' : hasMeteo ? 'Open-Meteo (modeled)' : 'Unavailable',
        is_modeled: isModeled,
        ttl,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: record,
        })
      );

      // 5. Send FCM push notification if decision worsens to MODIFY or MOVE_INDOORS (respecting F-06 Quiet Hours 8 PM - 6 AM BST)
      if (
        (evaluation.decision === 'MODIFY' || evaluation.decision === 'MOVE_INDOORS') &&
        !isQuietHoursBst()
      ) {
        await sendSchoolAlertPushNotification({
          schoolId: school.id,
          title: `⚠️ Alert: ${school.name}`,
          body: `Outdoor decision changed to ${evaluation.decision}. ${evaluation.reasons.join(', ')}`,
          data: {
            schoolId: school.id,
            decision: evaluation.decision,
            heatIndex: String(heatIndexC),
            aqi: String(aqi),
          },
        });
      }

      results.push({ schoolId: school.id, decision: evaluation.decision });
    } catch (schoolErr) {
      console.error(`Error processing school ${school.id}:`, schoolErr);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Poller finished successfully',
      districtsSeeded: BANGLADESH_64_DISTRICTS.length,
      results,
    }),
  };
};
