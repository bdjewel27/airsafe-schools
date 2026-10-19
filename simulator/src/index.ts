import { SensorDataGenerator } from './generator';
import { FaultMode } from './types';

const DEMO_SCHOOL_SENSORS = [
  { schoolId: 'school-dhaka-001', sensorId: 'dhk-001-field-1' },
  { schoolId: 'school-dhaka-001', sensorId: 'dhk-001-courtyard-1' },
  { schoolId: 'school-dhaka-001', sensorId: 'dhk-001-classroom-101' },
  { schoolId: 'school-ctg-002', sensorId: 'ctg-002-field-1' },
  { schoolId: 'school-raj-003', sensorId: 'raj-003-field-1' },
];

export async function runSimulationBatch(forcedFault?: FaultMode) {
  const generator = new SensorDataGenerator();
  const batch = [];

  for (const item of DEMO_SCHOOL_SENSORS) {
    const event = generator.generateEvent(item.schoolId, item.sensorId, forcedFault);
    batch.push(event);
  }

  return batch;
}

if (require.main === module) {
  console.log('--- AirSafe Sensor Simulator Test Run ---');
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
}
