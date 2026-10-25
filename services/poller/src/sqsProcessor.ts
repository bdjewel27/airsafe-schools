import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { calculateHeatIndex } from './heatindex';
import { evaluatePolicy, calculateAqiFromPm25 } from './policy';

const region = process.env.PROJECT_REGION || 'ap-southeast-2';
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.TABLE_NAME || 'AirSafe-Readings-dev';

export interface SQSRecordLike {
  messageId: string;
  body: string;
}

export interface SQSBatchResponseLike {
  batchItemFailures: { itemIdentifier: string }[];
}

export async function processSensorBatch(records: SQSRecordLike[]): Promise<SQSBatchResponseLike> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of records) {
    try {
      const payload = JSON.parse(record.body);

      // Validate required sensor event schema (Appendix B schema)
      if (
        !payload ||
        typeof payload !== 'object' ||
        !payload.event_id ||
        !payload.school_id ||
        !payload.sensor_id ||
        !payload.ts ||
        !payload.readings ||
        typeof payload.readings.temp_c !== 'number' ||
        !Number.isFinite(payload.readings.temp_c) ||
        typeof payload.readings.rh_pct !== 'number' ||
        !Number.isFinite(payload.readings.rh_pct) ||
        typeof payload.readings.pm25_ugm3 !== 'number' ||
        !Number.isFinite(payload.readings.pm25_ugm3)
      ) {
        console.warn(`[Quarantine/Malformed] Poisoned record ${record.messageId} forwarded to DLQ`);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      const { school_id, sensor_id, readings, ts } = payload;
      const tempC = readings.temp_c;
      const rhPct = readings.rh_pct;
      const pm25 = readings.pm25_ugm3;
      const heatIndexC = calculateHeatIndex(tempC, rhPct);
      // US EPA Standard Piecewise-Linear AQI from PM2.5 calculation per Appendix B
      const aqi = calculateAqiFromPm25(pm25);

      const evaluation = evaluatePolicy(aqi, heatIndexC, 'VIGOROUS', false);
      const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            school_id,
            timestamp: ts,
            sensor_id,
            readings: {
              temperature_c: tempC,
              relative_humidity_pct: rhPct,
              heat_index_c: heatIndexC,
              pm25_ugm3: pm25,
              aqi,
            },
            evaluation,
            source: 'Simulator Sensor Telemetry (SQS)',
            is_modeled: false,
            ttl,
          },
        })
      );
    } catch (err) {
      console.error(`Failed to process message ${record.messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

export const handler = async (event: { Records: SQSRecordLike[] }): Promise<SQSBatchResponseLike> => {
  return processSensorBatch(event.Records || []);
};
