import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { calculateHeatIndex } from './heatindex';
import { evaluatePolicy, calculateAqiFromPm25 } from './policy';
import { performDeltaCheck, classifyAnomalyWithNovaMicro, SensorTelemetryInput } from './plausibility';

const region = process.env.PROJECT_REGION || 'ap-southeast-2';
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const TABLE_NAME = process.env.TABLE_NAME || 'AirSafe-Readings-dev';

export interface SQSRecordLike {
  messageId: string;
  body: string;
}

export interface SQSBatchResponseLike {
  batchItemFailures: { itemIdentifier: string }[];
}

// In-memory deduplication cache & quarantine metrics (F-21)
const processedEventIds = new Set<string>();
export let quarantineMetricCount = 0;

export function getQuarantineMetricCount(): number {
  return quarantineMetricCount;
}

const lastReadingsMap = new Map<string, SensorTelemetryInput>();

export function resetDeduplicationCache(): void {
  processedEventIds.clear();
  lastReadingsMap.clear();
  quarantineMetricCount = 0;
}

export async function processSensorBatch(records: SQSRecordLike[]): Promise<SQSBatchResponseLike> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of records) {
    try {
      let payload: any;
      try {
        payload = JSON.parse(record.body);
      } catch {
        quarantineMetricCount++;
        console.warn(`[Quarantine/Malformed] Poisoned record ${record.messageId} unparseable JSON forwarded to DLQ [METRIC QuarantineCount=${quarantineMetricCount}]`);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // Validate required sensor event schema (Appendix B schema / F-21)
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
        quarantineMetricCount++;
        console.warn(
          `[Quarantine/Malformed] Poisoned record ${record.messageId} forwarded to DLQ [METRIC QuarantineCount=${quarantineMetricCount}]`
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // F-21: Consumer Idempotency via event_id
      if (payload.event_id) {
        if (processedEventIds.has(payload.event_id)) {
          console.warn(`[Deduplication] Dropping duplicate event_id: ${payload.event_id} (idempotent in-memory skip)`);
          continue;
        }
        processedEventIds.add(payload.event_id);

        try {
          await docClient.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                school_id: 'IDEMPOTENCY',
                timestamp: `EVENT#${payload.event_id}`,
                event_id: payload.event_id,
                observed_at: payload.ts,
                ttl: Math.floor(Date.now() / 1000) + 86400,
              },
              ConditionExpression: 'attribute_not_exists(#ts)',
              ExpressionAttributeNames: { '#ts': 'timestamp' },
            })
          );
        } catch (dedupErr: any) {
          if (dedupErr.name === 'ConditionalCheckFailedException') {
            console.warn(`[Deduplication] Duplicate event_id detected in DynamoDB: ${payload.event_id} (idempotent skip)`);
            continue;
          }
        }
      }

      const { school_id, sensor_id, readings, ts, event_id } = payload;
      const tempC = readings.temp_c;
      const rhPct = readings.rh_pct;
      const pm25 = readings.pm25_ugm3;
      const heatIndexC = calculateHeatIndex(tempC, rhPct);
      // US EPA Standard Piecewise-Linear AQI from PM2.5 calculation per Appendix B
      const aqi = calculateAqiFromPm25(pm25);

      // F-23: Delta limits validation & Nova Micro anomaly classification
      const currentTelemetry: SensorTelemetryInput = { temp_c: tempC, rh_pct: rhPct, pm25_ugm3: pm25, ts, sensor_id, school_id };
      const priorTelemetry = lastReadingsMap.get(sensor_id) || null;
      const deltaCheck = performDeltaCheck(currentTelemetry, priorTelemetry, null);
      lastReadingsMap.set(sensor_id, currentTelemetry);

      let anomalyClassification: any = null;
      if (deltaCheck.isAnomalous) {
        anomalyClassification = await classifyAnomalyWithNovaMicro({
          current: currentTelemetry,
          flags: deltaCheck.flags,
          deltas: deltaCheck.deltas,
          prior: priorTelemetry,
        });
      }

      // P4: Multi-intensity evaluations across LIGHT, MODERATE, VIGOROUS
      const evaluations = {
        LIGHT: evaluatePolicy(aqi, heatIndexC, 'LIGHT', false),
        MODERATE: evaluatePolicy(aqi, heatIndexC, 'MODERATE', false),
        VIGOROUS: evaluatePolicy(aqi, heatIndexC, 'VIGOROUS', false),
      };
      const evaluation = evaluations.VIGOROUS;
      const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const fetchedAt = new Date().toISOString();

      // 1. Save historical time-series reading with composite key (${ts}#${sensor_id}) to prevent key collision (F-21)
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            school_id,
            timestamp: `${ts}#${sensor_id}`,
            sensor_id,
            observed_at: ts,
            event_id,
            readings: {
              temperature_c: tempC,
              relative_humidity_pct: rhPct,
              heat_index_c: heatIndexC,
              pm25_ugm3: pm25,
              aqi,
            },
            provenance: {
              fetched_at: fetchedAt,
              air_quality: {
                source: 'Campus IoT Sensor (measured)',
                is_modeled: false,
                observed_at: ts,
                fetched_at: fetchedAt,
                station_id: sensor_id,
                values: { pm25_ugm3: pm25, aqi },
              },
              weather: {
                source: 'Campus IoT Sensor (measured)',
                is_modeled: false,
                observed_at: ts,
                fetched_at: fetchedAt,
                station_id: sensor_id,
                values: { temperature_c: tempC, relative_humidity_pct: rhPct, heat_index_c: heatIndexC },
              },
            },
            evaluations,
            evaluation,
            delta_check: deltaCheck,
            anomaly_classification: anomalyClassification,
            source: 'Simulator Sensor Telemetry (SQS)',
            is_modeled: false,
            ttl,
          },
        })
      );

      // 2. P6: Persist dedicated latest reading for sensor station (LATEST#<sensor_id>)
      // F-21: Guard against out-of-order delayed events regressing the live reading
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              school_id,
              timestamp: `LATEST#${sensor_id}`,
              sensor_id,
              observed_at: ts,
              readings: {
                temperature_c: tempC,
                relative_humidity_pct: rhPct,
                heat_index_c: heatIndexC,
                pm25_ugm3: pm25,
                aqi,
              },
              evaluations,
              evaluation,
              source: 'Campus IoT Sensor (measured)',
              is_modeled: false,
              is_online: true,
              ttl,
            },
            ConditionExpression: 'attribute_not_exists(observed_at) OR observed_at <= :ts',
            ExpressionAttributeValues: {
              ':ts': ts,
            },
          })
        );
      } catch (condErr: any) {
        if (condErr.name === 'ConditionalCheckFailedException') {
          console.info(`[Delayed Event] Event ${event_id} observed at ${ts} is older than current latest station reading. Historical record preserved; LATEST# not regressed.`);
        } else {
          throw condErr;
        }
      }
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
