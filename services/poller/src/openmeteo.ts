/**
 * Open-Meteo API Client (Weather & Air Quality)
 * No API key required. Attribution: Open-Meteo.com
 * P2: Fetches and parses hourly forecasts to evaluate worst-case environmental conditions (Policy Rule 2).
 */

import { calculateHeatIndex } from './heatindex';

export interface HourlyForecastPoint {
  time: string;
  temperatureC: number;
  relativeHumidityPct: number;
  apparentTemperatureC: number;
  heatIndexC: number;
  pm25: number;
  usAqi: number;
}

export interface OpenMeteoData {
  temperatureC: number;
  relativeHumidityPct: number;
  apparentTemperatureC: number;
  pm25: number;
  usAqi: number;
  timestamp: string;
  isModeled: boolean;
  hourlyForecast?: HourlyForecastPoint[];
}

export async function fetchOpenMeteoData(latitude: number, longitude: number): Promise<OpenMeteoData | null> {
  try {
    // 1. Weather API for Temperature & Humidity with hourly forecast (P2)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,relative_humidity_2m,apparent_temperature&timezone=auto`;
    // 2. Air Quality API for PM2.5 and US AQI with hourly forecast (P2)
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm2_5,us_aqi&hourly=pm2_5,us_aqi&timezone=auto`;

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

    const hourlyWeather = weatherJson.hourly || {};
    const hourlyAir = airJson.hourly || {};
    const times: string[] = hourlyWeather.time || hourlyAir.time || [];

    const hourlyForecast: HourlyForecastPoint[] = [];
    const limit = Math.min(times.length, 48);
    for (let i = 0; i < limit; i++) {
      const timeStr = times[i];
      const isoTime = timeStr.includes('Z') ? timeStr : new Date(timeStr).toISOString();
      const tC = hourlyWeather.temperature_2m?.[i] ?? 28;
      const rh = hourlyWeather.relative_humidity_2m?.[i] ?? 65;
      const appC = hourlyWeather.apparent_temperature?.[i] ?? 30;
      const p25 = hourlyAir.pm2_5?.[i] ?? 35;
      const aqiVal = hourlyAir.us_aqi?.[i] ?? 75;
      const hi = calculateHeatIndex(tC, rh);

      hourlyForecast.push({
        time: isoTime,
        temperatureC: tC,
        relativeHumidityPct: rh,
        apparentTemperatureC: appC,
        heatIndexC: hi,
        pm25: p25,
        usAqi: aqiVal,
      });
    }

    return {
      temperatureC: currentWeather.temperature_2m ?? 28,
      relativeHumidityPct: currentWeather.relative_humidity_2m ?? 65,
      apparentTemperatureC: currentWeather.apparent_temperature ?? 30,
      pm25: currentAir.pm2_5 ?? 35,
      usAqi: currentAir.us_aqi ?? 75,
      timestamp: currentWeather.time ? new Date(currentWeather.time).toISOString() : new Date().toISOString(),
      isModeled: true, // Open-Meteo weather models
      hourlyForecast,
    };
  } catch (error) {
    console.error('Error fetching Open-Meteo data:', error);
    return null;
  }
}
