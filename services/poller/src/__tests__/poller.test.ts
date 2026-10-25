import { pollDistrictFeeds } from '../index';
import { DEMO_SCHOOLS, BANGLADESH_64_DISTRICTS } from '../districts';
import * as openMeteoModule from '../openmeteo';

describe('F-20: Multi-School & 64 Districts Polling Pipeline', () => {
  test('DEMO_SCHOOLS contains Dhaka, Chittagong, and Rajshahi with matching login IDs and aliases', () => {
    expect(DEMO_SCHOOLS).toHaveLength(3);

    const dhaka = DEMO_SCHOOLS.find((s) => s.id === 'school-dhaka-001');
    const ctg = DEMO_SCHOOLS.find((s) => s.id === 'school-chattogram-001');
    const raj = DEMO_SCHOOLS.find((s) => s.id === 'school-rajshahi-001');

    expect(dhaka).toBeDefined();
    expect(ctg).toBeDefined();
    expect(raj).toBeDefined();

    expect(ctg?.aliases).toContain('school-ctg-002');
    expect(raj?.aliases).toContain('school-raj-003');
  });

  test('BANGLADESH_64_DISTRICTS contains all 64 district headquarters across all 8 divisions', () => {
    expect(BANGLADESH_64_DISTRICTS).toHaveLength(64);

    const divisions = new Set(BANGLADESH_64_DISTRICTS.map((d) => d.division));
    expect(divisions).toContain('Dhaka');
    expect(divisions).toContain('Chattogram');
    expect(divisions).toContain('Rajshahi');
    expect(divisions).toContain('Khulna');
    expect(divisions).toContain('Barishal');
    expect(divisions).toContain('Sylhet');
    expect(divisions).toContain('Rangpur');
    expect(divisions).toContain('Mymensingh');
    expect(divisions.size).toBe(8);

    // Verify coordinates and baseline values exist for every district
    for (const district of BANGLADESH_64_DISTRICTS) {
      expect(district.id).toMatch(/^bd-/);
      expect(district.lat).toBeGreaterThan(20);
      expect(district.lat).toBeLessThan(27);
      expect(district.lon).toBeGreaterThan(88);
      expect(district.lon).toBeLessThan(93);
      expect(district.baselineAqi).toBeGreaterThan(0);
      expect(district.baselineHeatIndexC).toBeGreaterThan(0);
    }
  });

  test('pollDistrictFeeds stores modeled public feed records for all 64 districts', async () => {
    // Mock openmeteo to avoid live network rate-limits in unit tests
    jest.spyOn(openMeteoModule, 'fetchOpenMeteoData').mockResolvedValue({
      temperatureC: 30.5,
      relativeHumidityPct: 62,
      apparentTemperatureC: 34.0,
      pm25: 42.0,
      usAqi: 112,
      timestamp: new Date().toISOString(),
      isModeled: true,
      hourlyForecast: [],
    });

    const savedItems: any[] = [];
    const mockClient = {
      send: jest.fn().mockImplementation(async (command: any) => {
        if (command.input?.Item) {
          savedItems.push(command.input.Item);
        }
        return {};
      }),
    };

    const polledCount = await pollDistrictFeeds(
      BANGLADESH_64_DISTRICTS,
      mockClient,
      'AirSafe-Readings-dev',
      123456789
    );

    expect(polledCount).toBe(64);
    // 64 historical records + 64 LATEST# records = 128 items written
    expect(savedItems.length).toBe(128);

    const dhakaDistrict = savedItems.find((item) => item.school_id === 'bd-dhaka' && !item.timestamp.startsWith('LATEST#'));
    expect(dhakaDistrict).toBeDefined();
    expect(dhakaDistrict.district_name).toBe('Dhaka');
    expect(dhakaDistrict.district_name_bn).toBe('ঢাকা');
    expect(dhakaDistrict.is_district_feed).toBe(true);
    expect(dhakaDistrict.readings.aqi).toBeDefined();

    const ctgDistrict = savedItems.find((item) => item.school_id === 'bd-chattogram' && !item.timestamp.startsWith('LATEST#'));
    expect(ctgDistrict).toBeDefined();
    expect(ctgDistrict.division).toBe('Chattogram');
  });
});
