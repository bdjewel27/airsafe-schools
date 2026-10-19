import { SensorDataGenerator } from '../generator';
import { SensorEvent } from '../types';

describe('Sensor Data Generator & Fault Injection (Appendix B)', () => {
  let generator: SensorDataGenerator;

  beforeEach(() => {
    generator = new SensorDataGenerator();
  });

  test('generates valid normal event matching schema', () => {
    const event = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'NORMAL') as SensorEvent;
    expect(event.event_id).toBeDefined();
    expect(event.event_id.length).toBe(26); // ULID length
    expect(event.school_id).toBe('school-dhaka-001');
    expect(event.sensor_id).toBe('dhk-001-field-1');
    expect(event.readings.temp_c).toBeGreaterThan(15);
    expect(event.readings.rh_pct).toBeGreaterThan(20);
    expect(event.readings.pm25_ugm3).toBeGreaterThan(0);
    expect(event.fw).toBe('1.4.2');
  });

  test('generates duplicate event when forced', () => {
    const first = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'NORMAL') as SensorEvent;
    const dup = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'DUPLICATE') as SensorEvent;
    expect(dup.event_id).toBe(first.event_id);
    expect(dup._injectedFault).toBe('DUPLICATE');
  });

  test('generates late event with timestamp in past', () => {
    const now = Date.now();
    const late = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'LATE') as SensorEvent;
    const eventTime = new Date(late.ts).getTime();
    expect(now - eventTime).toBeGreaterThanOrEqual(60 * 1000); // At least 1 min in the past
    expect(late._injectedFault).toBe('LATE');
  });

  test('generates spike event with high PM2.5', () => {
    const spike = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'SPIKE') as SensorEvent;
    expect(spike.readings.pm25_ugm3).toBeGreaterThan(200);
    expect(spike._injectedFault).toBe('SPIKE');
  });

  test('generates malformed event for quarantine testing', () => {
    const malformed = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'MALFORMED') as any;
    expect(malformed.readings.temp_f).toBeDefined();
    expect(malformed.readings.pm25_ugm3).toBeUndefined();
    expect(malformed._injectedFault).toBe('MALFORMED');
  });

  test('generates silent mode (null) to test stale/offline detection', () => {
    const silent = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'SILENT');
    expect(silent).toBeNull();
  });

  test('generates burst event containing rapid sequence of 10 events', () => {
    const burst = generator.generateEvent('school-dhaka-001', 'dhk-001-field-1', 'BURST') as SensorEvent;
    expect(burst._injectedFault).toBe('BURST');
    expect(burst._burstEvents).toBeDefined();
    expect(burst._burstEvents?.length).toBe(10);
    expect(burst._burstEvents?.[0].event_id).toBeDefined();
  });
});
