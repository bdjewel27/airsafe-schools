/**
 * NOAA Rothfusz regression equation for Heat Index
 * Returns Heat Index in Celsius
 */
export function calculateHeatIndex(tempC: number, rhPct: number): number {
  const T = (tempC * 9) / 5 + 32; // Fahrenheit
  const RH = rhPct;

  // Simple equation first
  let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));

  if (HI >= 80) {
    // Full Rothfusz regression
    HI =
      -42.379 +
      2.04901523 * T +
      10.14333127 * RH -
      0.22475541 * T * RH -
      0.00683783 * T * T -
      0.05481717 * RH * RH +
      0.00122874 * T * T * RH +
      0.00085282 * T * RH * RH -
      0.00000199 * T * T * RH * RH;

    // Adjustments
    if (RH < 13 && T >= 80 && T <= 112) {
      const adjustment = ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
      HI -= adjustment;
    } else if (RH > 85 && T >= 80 && T <= 87) {
      const adjustment = ((RH - 85) / 10) * ((87 - T) / 5);
      HI += adjustment;
    }
  }

  // Convert back to Celsius and round to 1 decimal place
  const heatIndexC = ((HI - 32) * 5) / 9;
  return Math.round(heatIndexC * 10) / 10;
}
