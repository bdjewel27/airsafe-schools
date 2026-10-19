export interface SensorReadings {
  temp_c: number;
  rh_pct: number;
  pm25_ugm3: number;
}

export interface SensorEvent {
  event_id: string; // ULID
  sensor_id: string;
  school_id: string;
  ts: string; // UTC ISO 8601
  readings: SensorReadings;
  battery_pct: number;
  fw: string;
  _injectedFault?: 'DUPLICATE' | 'LATE' | 'SPIKE' | 'MALFORMED' | 'SILENT' | 'BURST';
  _burstEvents?: SensorEvent[];
}

export type FaultMode = 'NORMAL' | 'DUPLICATE' | 'LATE' | 'SPIKE' | 'MALFORMED' | 'SILENT' | 'BURST';
