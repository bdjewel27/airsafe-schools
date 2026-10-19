/**
 * OpenAQ v3 Client
 */

export interface OpenAQReading {
  sensorId: string;
  locationId: number;
  locationName: string;
  pm25: number;
  timestamp: string;
  isModeled: boolean;
}

export async function fetchOpenAQReadings(apiKey: string, coordinates: { latitude: number; longitude: number; radiusKm?: number }): Promise<OpenAQReading[]> {
  try {
    const radius = (coordinates.radiusKm || 25) * 1000; // in meters
    const url = `https://api.openaq.org/v3/locations?coordinates=${coordinates.latitude},${coordinates.longitude}&radius=${radius}&limit=5`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`OpenAQ API responded with status ${response.status}: ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const results: OpenAQReading[] = [];

    if (data && Array.isArray(data.results)) {
      for (const loc of data.results) {
        // Look for PM2.5 sensors
        if (loc.sensors && Array.isArray(loc.sensors)) {
          const pm25Sensor = loc.sensors.find((s: any) => s.parameter?.name === 'pm25');
          if (pm25Sensor && pm25Sensor.latest) {
            results.push({
              sensorId: `openaq-${pm25Sensor.id}`,
              locationId: loc.id,
              locationName: loc.name || 'Unknown Station',
              pm25: pm25Sensor.latest.value,
              timestamp: pm25Sensor.latest.datetime,
              isModeled: false, // OpenAQ stations are measured
            });
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error fetching OpenAQ readings:', error);
    return [];
  }
}
