import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { SensorDataGenerator } from './generator';
import { FaultMode } from './types';

// Canonical demo schools aligned with F-20 and project brief (Dhaka, Chattogram, Rajshahi)
export const DEMO_SCHOOL_SENSORS = [
  { schoolId: 'school-dhaka-001', sensorId: 'dhk-001-field-1' },
  { schoolId: 'school-dhaka-001', sensorId: 'dhk-001-courtyard-1' },
  { schoolId: 'school-dhaka-001', sensorId: 'dhk-001-classroom-101' },
  { schoolId: 'school-chattogram-001', sensorId: 'ctg-001-field-1' },
  { schoolId: 'school-rajshahi-001', sensorId: 'raj-001-field-1' },
];

const region = process.env.PROJECT_REGION || 'ap-southeast-2';
let defaultSqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient {
  if (!defaultSqsClient) {
    defaultSqsClient = new SQSClient({ region });
  }
  return defaultSqsClient;
}

export async function sendBatchToSqs(
  events: any[],
  queueUrl?: string,
  client?: SQSClient
): Promise<{ successful: number; failed: number }> {
  const targetQueueUrl = queueUrl || process.env.SQS_QUEUE_URL;
  if (!targetQueueUrl) {
    return { successful: 0, failed: 0 };
  }

  const effectiveClient = client || getSqsClient();
  const validEvents = events.filter(Boolean);
  if (validEvents.length === 0) return { successful: 0, failed: 0 };

  const entries = validEvents.map((evt, idx) => ({
    Id: `msg-${idx}-${Date.now()}`,
    MessageBody: typeof evt === 'string' ? evt : JSON.stringify(evt),
  }));

  let successful = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += 10) {
    const chunk = entries.slice(i, i + 10);
    try {
      const res = await effectiveClient.send(
        new SendMessageBatchCommand({
          QueueUrl: targetQueueUrl,
          Entries: chunk,
        })
      );
      successful += res.Successful?.length || 0;
      failed += res.Failed?.length || 0;
    } catch (err) {
      console.error('[Simulator SQS Error]: Failed to send batch to SQS:', err);
      failed += chunk.length;
    }
  }

  return { successful, failed };
}

export async function runSimulationBatch(
  forcedFault?: FaultMode,
  options?: { sendToSqs?: boolean; queueUrl?: string; sqsClient?: SQSClient }
) {
  const generator = new SensorDataGenerator();
  const batch: any[] = [];

  for (const item of DEMO_SCHOOL_SENSORS) {
    const event = generator.generateEvent(item.schoolId, item.sensorId, forcedFault);
    if (event) {
      batch.push(event);
      if (event._burstEvents && Array.isArray(event._burstEvents)) {
        batch.push(...event._burstEvents);
      }
    }
  }

  const shouldSendToSqs =
    Boolean(options?.sendToSqs) ||
    Boolean(options?.queueUrl) ||
    Boolean(process.env.SQS_QUEUE_URL && options?.sendToSqs !== false);

  if (shouldSendToSqs) {
    await sendBatchToSqs(batch, options?.queueUrl, options?.sqsClient);
  }

  return batch;
}

if (require.main === module) {
  console.log('--- AirSafe Sensor Simulator Test Run (F-21) ---');
  const generator = new SensorDataGenerator();

  // Test Normal
  console.log('1. Normal Reading:');
  console.log(generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'NORMAL'));

  // Test Faults
  console.log('\n2. Spike Fault (PM2.5 x 20):');
  console.log(generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'SPIKE'));

  // Test Malformed
  console.log('\n3. Malformed Event:');
  console.log(generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'MALFORMED'));

  // Test Late / Delayed
  console.log('\n4. Late Delayed Event:');
  console.log(generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'LATE'));
}
