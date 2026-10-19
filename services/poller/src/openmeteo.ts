/**
 * Open-Meteo API Client (Weather & Air Quality)
 * No API key required. Attribution: Open-Meteo.com
 */

export interface OpenMeteoData {
  temperatureC: number;
  relativeHumidityPct: number;
  apparentTemperatureC: number;
  pm25: number;
  usAqi: number;
  timestamp: string;
  isModeled: boolean;
}

export async function fetchOpenMeteoData(latitude: number, longitude: number): Promise<OpenMeteoData | null> {
  try {
    // 1. Weather API for Temperature & Humidity
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature&timezone=auto`;
    // 2. Air Quality API for PM2.5 and US AQI
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm2_5,us_aqi&timezone=auto`;

    const [weatherRes, airRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(airQualityUrl),
    ]);

    if (!weatherRes.ok || !airRes.ok) {
      console.warn(`Open-Meteo fetch error: weather=${weatherRes.status}, air=${airRes.status}`);
      return null;
    }

    const weatherJson = await weatherRes.json();
    const airJson = await airRes.json();

    const currentWeather = weatherJson.current || {};
    const currentAir = airJson.current || {};

    return {
      temperatureC: currentWeather.temperature_2m ?? 28,
      relativeHumidityPct: currentWeather.relative_humidity_2m ?? 65,
      apparentTemperatureC: currentWeather.apparent_temperature ?? 30,
      pm25: currentAir.pm2_5 ?? 35,
      usAqi: currentAir.us_aqi ?? 75,
      timestamp: currentWeather.time ? new Date(currentWeather.time).toISOString() : new Date().toISOString(),
      isModeled: true, // Open-Meteo weather models
    };
  } catch (error) {
    console.error('Error fetching Open-Meteo data:', error);
    return null;
  }
}
