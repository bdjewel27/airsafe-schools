import * as crypto from 'crypto';
import { isQuietHoursBst, hasConditionWorsened } from '../index';
import { initializeFirebase, sendSchoolAlertPushNotification, resetFirebaseForTesting, isFirebaseConfigured } from '../fcm';

describe('F-06: FCM Push Notification & Quiet Hours Enforcement (21:00 - 06:00 BST)', () => {
  test('Quiet hours are active from 21:00 (9 PM) to 06:00 (6 AM) Asia/Dhaka (UTC+6)', () => {
    // 9:00 PM BST is 15:00 UTC -> quiet hours active
    const nightStart = new Date('2026-10-18T15:00:00Z');
    expect(isQuietHoursBst(nightStart)).toBe(true);

    // 11:00 PM BST is 17:00 UTC -> quiet hours active
    const lateNightDate = new Date('2026-10-18T17:00:00Z');
    expect(isQuietHoursBst(lateNightDate)).toBe(true);

    // 2:00 AM BST is 20:00 UTC (previous day) -> quiet hours active
    const earlyMorningDate = new Date('2026-10-18T20:00:00Z');
    expect(isQuietHoursBst(earlyMorningDate)).toBe(true);

    // 5:45 AM BST is 23:45 UTC -> quiet hours active
    const dawnDate = new Date('2026-10-18T23:45:00Z');
    expect(isQuietHoursBst(dawnDate)).toBe(true);
  });

  test('Quiet hours are INACTIVE during operating hours (06:00 to 20:59 BST)', () => {
    // 6:00 AM BST is 00:00 UTC -> morning starts, quiet hours inactive
    const morningStart = new Date('2026-10-18T00:00:00Z');
    expect(isQuietHoursBst(morningStart)).toBe(false);

    // 7:00 AM BST is 01:00 UTC -> school morning active
    const morningDate = new Date('2026-10-18T01:00:00Z');
    expect(isQuietHoursBst(morningDate)).toBe(false);

    // 12:30 PM BST is 06:30 UTC -> midday active
    const noonDate = new Date('2026-10-18T06:30:00Z');
    expect(isQuietHoursBst(noonDate)).toBe(false);

    // 4:00 PM BST is 10:00 UTC -> afternoon sports active
    const afternoonDate = new Date('2026-10-18T10:00:00Z');
    expect(isQuietHoursBst(afternoonDate)).toBe(false);

    // 8:30 PM BST is 14:30 UTC -> evening active (STATUS & day1: quiet hours only start at 21:00)
    const eveningDate = new Date('2026-10-18T14:30:00Z');
    expect(isQuietHoursBst(eveningDate)).toBe(false);
  });

  test('State Transition Detection: triggers alert ONLY when safety condition worsens', () => {
    // Worsening transitions: MUST trigger alert
    expect(hasConditionWorsened('PROCEED', 'MODIFY')).toBe(true);
    expect(hasConditionWorsened('PROCEED_WITH_PRECAUTIONS', 'MODIFY')).toBe(true);
    expect(hasConditionWorsened('PROCEED', 'MOVE_INDOORS')).toBe(true);
    expect(hasConditionWorsened('MODIFY', 'MOVE_INDOORS')).toBe(true);
    expect(hasConditionWorsened(null, 'MODIFY')).toBe(true);
    expect(hasConditionWorsened(null, 'MOVE_INDOORS')).toBe(true);

    // Unchanged condition: MUST NOT trigger duplicate alert every hour
    expect(hasConditionWorsened('MODIFY', 'MODIFY')).toBe(false);
    expect(hasConditionWorsened('MOVE_INDOORS', 'MOVE_INDOORS')).toBe(false);

    // Improving conditions: MUST NOT trigger danger alert
    expect(hasConditionWorsened('MOVE_INDOORS', 'MODIFY')).toBe(false);
    expect(hasConditionWorsened('MOVE_INDOORS', 'PROCEED')).toBe(false);
    expect(hasConditionWorsened('MODIFY', 'PROCEED')).toBe(false);
    expect(hasConditionWorsened('PROCEED', 'PROCEED')).toBe(false);
    expect(hasConditionWorsened(null, 'PROCEED')).toBe(false);
  });

  describe('FCM Modular API Integration (firebase-admin v14 compat - QA Audit M4)', () => {
    beforeEach(() => {
      resetFirebaseForTesting();
    });

    test('Gracefully handles uninitialized state without crashing', async () => {
      const res = await sendSchoolAlertPushNotification({
        schoolId: 'school-dhaka-001',
        title: 'Alert',
        body: 'Severe pollution',
      });
      expect(res).toBe(false);
    });

    test('Initializes Firebase Admin using modular app & messaging exports without undefined errors', () => {
      const { privateKey } = (crypto.generateKeyPairSync as any)('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const mockKey = JSON.stringify({
        project_id: 'airsafe-test',
        client_email: 'firebase-adminsdk@airsafe-test.iam.gserviceaccount.com',
        private_key: privateKey,
      });

      const initialized = initializeFirebase(mockKey);
      expect(initialized).toBe(true);
      expect(isFirebaseConfigured()).toBe(true);
    });
  });
});
