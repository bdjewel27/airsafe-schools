import { ulid } from 'ulid';
import { SensorEvent, FaultMode } from './types';

export class SensorDataGenerator {
  private lastEvents: Map<string, SensorEvent> = new Map();

  /**
   * Generates a sensor event with realistic diurnal curves and all 7 Appendix B fault modes:
   * NORMAL, DUPLICATE, LATE, SPIKE, MALFORMED, SILENT, BURST (F-21)
   */
  public generateEvent(
    schoolId: string,
    sensorId: string,
    forceFault?: FaultMode
  ): SensorEvent | Record<string, any> | null {
    const now = new Date();
    const hour = now.getUTCHours() + 6; // Asia/Dhaka time offset approx
    const currentHour = hour % 24;

    // Diurnal curve: afternoon peak temperature, morning peak PM2.5
    const baseTemp = 28 + 6 * Math.sin(((currentHour - 9) * Math.PI) / 12);
    const tempNoise = (Math.random() - 0.5) * 1.5;
    const tempC = Math.round((baseTemp + tempNoise) * 10) / 10;

    const baseRH = 75 - 20 * Math.sin(((currentHour - 9) * Math.PI) / 12);
    const rhNoise = (Math.random() - 0.5) * 4.0;
    const rhPct = Math.min(99, Math.max(30, Math.round((baseRH + rhNoise) * 10) / 10));

    // PM2.5 higher in early morning and evening
    const basePM25 = 45 + 30 * Math.cos(((currentHour - 6) * Math.PI) / 12);
    const pmNoise = (Math.random() - 0.5) * 8.0;
    const pm25 = Math.max(5, Math.round((basePM25 + pmNoise) * 10) / 10);

    const normalEvent: SensorEvent = {
      event_id: ulid(),
      sensor_id: sensorId,
      school_id: schoolId,
      ts: now.toISOString(),
      readings: {
        temp_c: tempC,
        rh_pct: rhPct,
        pm25_ugm3: pm25,
      },
      battery_pct: Math.floor(75 + Math.random() * 25),
      fw: '1.4.2',
    };

    // Determine fault injection mode if not explicitly forced
    let mode: FaultMode = forceFault || 'NORMAL';
    if (!forceFault) {
      const rand = Math.random() * 100;
      if (rand < 5 && this.lastEvents.has(sensorId)) {
        mode = 'DUPLICATE';
      } else if (rand < 8) {
        mode = 'LATE';
      } else if (rand < 10) {
        mode = 'SPIKE';
      } else if (rand < 11) {
        mode = 'MALFORMED';
      }
    }

    switch (mode) {
      case 'DUPLICATE': {
        const last = this.lastEvents.get(sensorId);
        if (last) {
          return { ...last, _injectedFault: 'DUPLICATE' };
        }
        break;
      }

      case 'LATE': {
        // Delayed between 1 to 10 minutes
        const delayMs = Math.floor(1 + Math.random() * 9) * 60 * 1000;
        const delayedTime = new Date(now.getTime() - delayMs).toISOString();
        normalEvent.ts = delayedTime;
        normalEvent._injectedFault = 'LATE';
        break;
      }

      case 'SPIKE': {
        // Impossible spike: PM2.5 x 20
        normalEvent.readings.pm25_ugm3 = Math.round(normalEvent.readings.pm25_ugm3 * 20 * 10) / 10;
        normalEvent._injectedFault = 'SPIKE';
        break;
      }

      case 'MALFORMED': {
        // Missing required field or wrong unit
        return {
          event_id: normalEvent.event_id,
          sensor_id: sensorId,
          school_id: schoolId,
          ts: normalEvent.ts,
          readings: {
            temp_f: Math.round(tempC * 1.8 + 32), // wrong unit Fahrenheit!
            // missing pm25_ugm3
          },
          battery_pct: '85%', // string instead of number!
          _injectedFault: 'MALFORMED',
        };
      }

      case 'SILENT': {
        // Appendix B: Sensor stops emitting telemetry altogether (triggers stale-data path)
        return null;
      }

      case 'BURST': {
        // Appendix B: Emits 10x rapid burst of events for load/backpressure testing
        const burstEvents: SensorEvent[] = Array.from({ length: 10 }, (_, idx) => ({
          ...normalEvent,
          event_id: ulid(),
          ts: new Date(now.getTime() + idx * 10).toISOString(),
          _injectedFault: 'BURST',
        }));
        normalEvent._injectedFault = 'BURST';
        normalEvent._burstEvents = burstEvents;
        break;
      }

      case 'NORMAL':
      default:
        break;
    }

    this.lastEvents.set(sensorId, normalEvent);
    return normalEvent;
  }
}
