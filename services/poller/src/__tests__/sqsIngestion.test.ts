const mockSend = jest.fn().mockResolvedValue({});

// Mock DynamoDB DocumentClient
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({
        send: (...args: any[]) => mockSend(...args),
      })),
    },
  };
});

import { processSensorBatch, getQuarantineMetricCount } from '../sqsProcessor';

describe('SQS Ingestion Pipeline & Dead Letter Queue (DLQ) Quarantine', () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  test('successfully processes batch of valid sensor events with zero failures', async () => {
    const validRecords = [
      {
        messageId: 'msg-001',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-18T12:00:00Z',
          readings: { temp_c: 32.5, rh_pct: 65, pm25_ugm3: 45 },
          battery_pct: 88,
          fw: '1.4.2',
        }),
      },
      {
        messageId: 'msg-002',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
          sensor_id: 'dhk-001-courtyard-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-18T12:00:00Z',
          readings: { temp_c: 30.1, rh_pct: 70, pm25_ugm3: 38 },
          battery_pct: 92,
          fw: '1.4.2',
        }),
      },
    ];

    const result = await processSensorBatch(validRecords);
    expect(result.batchItemFailures).toHaveLength(0);
  });

  test('reports malformed / poisoned records in batchItemFailures for DLQ routing', async () => {
    const poisonedRecords = [
      {
        messageId: 'poison-001',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-18T12:00:00Z',
          readings: { temp_f: 90.5 }, // Missing pm25_ugm3, rh_pct, temp_c
        }),
      },
      {
        messageId: 'poison-002',
        body: 'NOT_EVEN_JSON{{{',
      },
    ];

    const result = await processSensorBatch(poisonedRecords);
    expect(result.batchItemFailures).toHaveLength(2);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('poison-001');
    expect(result.batchItemFailures[1].itemIdentifier).toBe('poison-002');
  });

  test('partial batch failures: valid records succeed while poisoned record is isolated to DLQ', async () => {
    const mixedBatch = [
      {
        messageId: 'valid-001',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-18T12:00:00Z',
          readings: { temp_c: 28.5, rh_pct: 55, pm25_ugm3: 20 },
        }),
      },
      {
        messageId: 'poison-003',
        body: JSON.stringify({ invalid_payload: true }),
      },
    ];

    const result = await processSensorBatch(mixedBatch);
    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('poison-003');
  });

  test('P4: processes valid sensor batch and stores multi-intensity evaluations (LIGHT, MODERATE, VIGOROUS)', async () => {
    const records = [
      {
        messageId: 'valid-p4',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5FAZ',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-18T12:00:00Z',
          readings: { temp_c: 32.0, rh_pct: 65, pm25_ugm3: 35.0 },
          battery_pct: 95,
        }),
      },
    ];

    const result = await processSensorBatch(records);
    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalled();
    const putCall = mockSend.mock.calls.find((c: any) => c[0]?.input?.Item?.evaluations);
    expect(putCall).toBeDefined();
    const item = putCall[0].input.Item;
    expect(item.evaluations).toBeDefined();
    expect(item.evaluations.LIGHT).toBeDefined();
    expect(item.evaluations.MODERATE).toBeDefined();
    expect(item.evaluations.VIGOROUS).toBeDefined();
    expect(item.evaluation).toBe(item.evaluations.VIGOROUS);
  });
  test('P6: persists dedicated LATEST#<sensor_id> item with real un-fabricated readings for each sensor station', async () => {
    const records = [
      {
        messageId: 'msg-p6-courtyard',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5FC1',
          sensor_id: 'dhk-001-courtyard-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-26T01:00:00Z',
          readings: { temp_c: 29.4, rh_pct: 68, pm25_ugm3: 31.2 },
          battery_pct: 90,
        }),
      },
    ];

    const result = await processSensorBatch(records);
    expect(result.batchItemFailures).toHaveLength(0);

    const latestCall = mockSend.mock.calls.find((c: any) => c[0]?.input?.Item?.timestamp === 'LATEST#dhk-001-courtyard-1');
    expect(latestCall).toBeDefined();
    const item = latestCall[0].input.Item;
    expect(item.sensor_id).toBe('dhk-001-courtyard-1');
    expect(item.readings.temperature_c).toBe(29.4);
    expect(item.readings.relative_humidity_pct).toBe(68);
    expect(item.readings.pm25_ugm3).toBe(31.2);
    expect(item.is_online).toBe(true);
  });

  test('F-21: Idempotency with event_id drops duplicate message without reprocessing or failing', async () => {
    const duplicateEventId = '01ARZ3NDEKTSV4RRFFQ69G5DUP';
    const batch = [
      {
        messageId: 'msg-dup-1',
        body: JSON.stringify({
          event_id: duplicateEventId,
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-26T10:00:00Z',
          readings: { temp_c: 30.0, rh_pct: 60, pm25_ugm3: 25 },
        }),
      },
      {
        messageId: 'msg-dup-2',
        body: JSON.stringify({
          event_id: duplicateEventId,
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-26T10:00:00Z',
          readings: { temp_c: 30.0, rh_pct: 60, pm25_ugm3: 25 },
        }),
      },
    ];

    const result = await processSensorBatch(batch);
    expect(result.batchItemFailures).toHaveLength(0);
    const timeSeriesPuts = mockSend.mock.calls.filter((c: any) =>
      c[0]?.input?.Item?.timestamp?.includes('2026-10-26T10:00:00Z')
    );
    expect(timeSeriesPuts).toHaveLength(1);
  });

  test('F-21: Key collision prevention: two sensors reporting at identical ts produce distinct sort keys without overwriting', async () => {
    const identicalTs = '2026-10-26T11:00:00Z';
    const batch = [
      {
        messageId: 'sensor-field',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5F01',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: identicalTs,
          readings: { temp_c: 32.0, rh_pct: 62, pm25_ugm3: 40 },
        }),
      },
      {
        messageId: 'sensor-courtyard',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5F02',
          sensor_id: 'dhk-001-courtyard-1',
          school_id: 'school-dhaka-001',
          ts: identicalTs,
          readings: { temp_c: 30.5, rh_pct: 65, pm25_ugm3: 35 },
        }),
      },
    ];

    const result = await processSensorBatch(batch);
    expect(result.batchItemFailures).toHaveLength(0);

    const timeSeriesPuts = mockSend.mock.calls.filter((c: any) =>
      c[0]?.input?.Item?.timestamp?.startsWith(identicalTs)
    );
    expect(timeSeriesPuts).toHaveLength(2);
    const timestamps = timeSeriesPuts.map((c: any) => c[0].input.Item.timestamp);
    expect(timestamps).toContain(`${identicalTs}#dhk-001-field-1`);
    expect(timestamps).toContain(`${identicalTs}#dhk-001-courtyard-1`);
  });

  test('F-21: Emits quarantine metrics on malformed and poisoned records', async () => {
    const initialQuarantine = getQuarantineMetricCount();
    const poisonedBatch = [
      {
        messageId: 'poison-metric-1',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5BAD',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-26T12:00:00Z',
          readings: { temp_c: NaN, rh_pct: 60, pm25_ugm3: 25 },
        }),
      },
      {
        messageId: 'poison-metric-2',
        body: 'NOT_JSON',
      },
    ];

    const result = await processSensorBatch(poisonedBatch);
    expect(result.batchItemFailures).toHaveLength(2);
    expect(getQuarantineMetricCount()).toBe(initialQuarantine + 2);
  });

  test('F-21: Delayed event preserves historical observation timestamp while guarding LATEST# station item', async () => {
    mockSend.mockImplementation(async (command: any) => {
      if (command.input?.Item?.timestamp?.startsWith('LATEST#')) {
        const error: any = new Error('ConditionalCheckFailedException');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      return {};
    });

    const delayedEvent = [
      {
        messageId: 'msg-delayed-old',
        body: JSON.stringify({
          event_id: '01ARZ3NDEKTSV4RRFFQ69G5OLD',
          sensor_id: 'dhk-001-field-1',
          school_id: 'school-dhaka-001',
          ts: '2026-10-26T08:00:00Z',
          readings: { temp_c: 27.0, rh_pct: 70, pm25_ugm3: 20 },
        }),
      },
    ];

    const result = await processSensorBatch(delayedEvent);
    expect(result.batchItemFailures).toHaveLength(0);

    const historicalCall = mockSend.mock.calls.find((c: any) =>
      c[0]?.input?.Item?.timestamp === '2026-10-26T08:00:00Z#dhk-001-field-1'
    );
    expect(historicalCall).toBeDefined();
    expect(historicalCall[0].input.Item.observed_at).toBe('2026-10-26T08:00:00Z');
  });
});
