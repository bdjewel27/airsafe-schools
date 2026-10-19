import { isQuietHoursBst } from '../index';

describe('F-06: FCM Push Notification & Quiet Hours Enforcement', () => {
  test('Quiet hours are active from 20:00 (8 PM) to 06:00 (6 AM) Asia/Dhaka (UTC+6)', () => {
    // 8:30 PM BST is 14:30 UTC -> quiet hours active
    const eveningDate = new Date('2026-10-18T14:30:00Z');
    expect(isQuietHoursBst(eveningDate)).toBe(true);

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

  test('Quiet hours are INACTIVE during school operating hours (06:00 to 19:59 BST)', () => {
    // 7:00 AM BST is 01:00 UTC -> school morning active
    const morningDate = new Date('2026-10-18T01:00:00Z');
    expect(isQuietHoursBst(morningDate)).toBe(false);

    // 12:30 PM BST is 06:30 UTC -> midday active
    const noonDate = new Date('2026-10-18T06:30:00Z');
    expect(isQuietHoursBst(noonDate)).toBe(false);

    // 4:00 PM BST is 10:00 UTC -> afternoon sports active
    const afternoonDate = new Date('2026-10-18T10:00:00Z');
    expect(isQuietHoursBst(afternoonDate)).toBe(false);

    // 7:45 PM BST is 13:45 UTC -> evening active
    const duskDate = new Date('2026-10-18T13:45:00Z');
    expect(isQuietHoursBst(duskDate)).toBe(false);
  });
});
