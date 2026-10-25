/**
 * Model School Outdoor Activity Policy v1.2 Implementation
 * Strictly evaluates activity decisions based on Appendix A.
 * Config-driven thresholds loaded from policy/v1.2.json.
 */

import policyConfig from './policy/v1.2.json';

export type ActivityIntensity = 'LIGHT' | 'MODERATE' | 'VIGOROUS';

export type PolicyDecision =
  | 'PROCEED'
  | 'PROCEED_WITH_PRECAUTIONS'
  | 'MODIFY'
  | 'MOVE_INDOORS'
  | 'UNKNOWN';

export const DECISION_SEVERITY_ORDER: Record<PolicyDecision, number> = {
  PROCEED: 1,
  PROCEED_WITH_PRECAUTIONS: 2,
  MODIFY: 3,
  MOVE_INDOORS: 4,
  UNKNOWN: 5,
};

export interface DecisionEvaluationResult {
  decision: PolicyDecision;
  aqiDecision: PolicyDecision;
  heatDecision: PolicyDecision;
  reasons: string[];
  reasonCodes: string[];
  maxDurationMinutes?: number;
  requiresShade: boolean;
  isStale: boolean;
  isModeled: boolean;
  policyVersion: string;
  hasRespiratoryCondition?: boolean;
}

/**
 * US EPA PM2.5 to AQI Piecewise-Linear Interpolation (Appendix B & EPA NowCast standard)
 * Formula: Ip = ((I_high - I_low) / (BP_high - BP_low)) * (Cp - BP_low) + I_low
 */
export function calculateAqiFromPm25(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 < 0) {
    return 0;
  }
  const c = Math.round(pm25 * 10) / 10;
  const breakpoints = (policyConfig as any).pm25Breakpoints || [
    { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
    { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
    { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
  ];

  if (c >= 500.4) {
    return 500;
  }

  for (const bp of breakpoints) {
    if (c >= bp.cLow && c <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }

  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (c > breakpoints[i].cHigh && c < breakpoints[i + 1].cLow) {
      const bp = breakpoints[i];
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }

  return 500;
}

export function evaluateAQIDecision(
  aqi: number,
  intensity: ActivityIntensity,
  hasRespiratoryCondition: boolean = false
): { decision: PolicyDecision; maxMinutes?: number; reasonCode: string } {
  if (!Number.isFinite(aqi)) {
    return { decision: 'MOVE_INDOORS', reasonCode: 'INVALID_AQI_VALUE' };
  }

  // Appendix A Rule: Sensitive/asthmatic students -> treat AQI category as one tier higher
  const bands = policyConfig.aqiBands;
  let bandIndex = bands.findIndex(b => aqi <= b.max);
  if (bandIndex === -1) {
    bandIndex = bands.length - 1;
  }

  if (hasRespiratoryCondition) {
    bandIndex = Math.min(bandIndex + 1, bands.length - 1);
  }

  const band = bands[bandIndex];
  if (intensity === 'VIGOROUS') {
    const decision = band.vigorousDecision as PolicyDecision;
    const maxMinutes = 'vigorousMaxMinutes' in band ? (band as any).vigorousMaxMinutes : undefined;
    const reasonCode = band.vigorousDecision !== band.defaultDecision ? `${band.code}_VIGOROUS` : band.code;
    return { decision, maxMinutes, reasonCode };
  } else {
    const decision = band.defaultDecision as PolicyDecision;
    const maxMinutes = 'defaultMaxMinutes' in band ? (band as any).defaultMaxMinutes : undefined;
    return { decision, maxMinutes, reasonCode: band.code };
  }
}

export function evaluateHeatDecision(
  heatIndexC: number,
  intensity: ActivityIntensity
): { decision: PolicyDecision; maxMinutes?: number; requiresShade: boolean; reasonCode: string } {
  if (!Number.isFinite(heatIndexC)) {
    return { decision: 'MOVE_INDOORS', requiresShade: true, reasonCode: 'INVALID_HEAT_VALUE' };
  }

  const bands = policyConfig.heatBands;
  let band = bands.find(b => heatIndexC < b.max);
  if (!band) {
    band = bands[bands.length - 1];
  }

  if (intensity === 'LIGHT') {
    const decision = band.lightDecision as PolicyDecision;
    const maxMinutes = 'lightMaxMinutes' in band ? (band as any).lightMaxMinutes : undefined;
    const reasonCode = band.lightDecision !== band.defaultDecision ? `${band.code}_LIGHT` : band.code;
    return {
      decision,
      maxMinutes,
      requiresShade: Boolean(band.requiresShade),
      reasonCode,
    };
  } else {
    const decision = band.defaultDecision as PolicyDecision;
    const maxMinutes = 'defaultMaxMinutes' in band ? (band as any).defaultMaxMinutes : undefined;
    return {
      decision,
      maxMinutes,
      requiresShade: Boolean(band.requiresShade),
      reasonCode: band.code,
    };
  }
}

export function evaluatePolicy(
  aqi: number,
  heatIndexC: number,
  intensity: ActivityIntensity,
  isModeled: boolean = false,
  isStale: boolean = false,
  hasRespiratoryCondition: boolean = false
): DecisionEvaluationResult {
  // Input Validation Guard (P-4: fail-closed with clear reason)
  if (!Number.isFinite(aqi) || !Number.isFinite(heatIndexC)) {
    return {
      decision: 'MOVE_INDOORS',
      aqiDecision: 'MOVE_INDOORS',
      heatDecision: 'MOVE_INDOORS',
      reasons: ['Invalid sensor readings (non-finite value): defaulting to MOVE_INDOORS for safety'],
      reasonCodes: ['INVALID_SENSOR_INPUT'],
      requiresShade: true,
      isStale,
      isModeled,
      policyVersion: policyConfig.version,
      hasRespiratoryCondition
    };
  }

  const aqiResult = evaluateAQIDecision(aqi, intensity, hasRespiratoryCondition);
  const heatResult = evaluateHeatDecision(heatIndexC, intensity);

  // Take the stricter of the two decisions (Dominance / Strictest Outcome)
  let finalDecision: PolicyDecision =
    DECISION_SEVERITY_ORDER[aqiResult.decision] >= DECISION_SEVERITY_ORDER[heatResult.decision]
      ? aqiResult.decision
      : heatResult.decision;

  const reasons: string[] = [];
  const reasonCodes: string[] = [];

  if (finalDecision === aqiResult.decision) {
    reasons.push(`AQI ${aqi} triggers ${aqiResult.decision}`);
    reasonCodes.push(aqiResult.reasonCode);
  }
  if (finalDecision === heatResult.decision) {
    reasons.push(`Heat Index ${heatIndexC}°C triggers ${heatResult.decision}`);
    reasonCodes.push(heatResult.reasonCode);
  }
  if (hasRespiratoryCondition) {
    reasons.push('Respiratory condition active: AQI category stepped up');
    reasonCodes.push('RESPIRATORY_CONDITION_STEPPED_UP');
  }

  // Rule 3: Modeled data floor: cannot be better than PROCEED_WITH_PRECAUTIONS
  if (isModeled && DECISION_SEVERITY_ORDER[finalDecision] < DECISION_SEVERITY_ORDER.PROCEED_WITH_PRECAUTIONS) {
    finalDecision = 'PROCEED_WITH_PRECAUTIONS';
    reasons.push('Data is modeled: capped at PROCEED_WITH_PRECAUTIONS');
    reasonCodes.push('MODELED_DATA_FLOOR');
  }

  // Rule 4: Stale data (>90 min): cannot be better than PROCEED_WITH_PRECAUTIONS
  if (isStale && DECISION_SEVERITY_ORDER[finalDecision] < DECISION_SEVERITY_ORDER.PROCEED_WITH_PRECAUTIONS) {
    finalDecision = 'PROCEED_WITH_PRECAUTIONS';
    reasons.push('Data is older than 90 mins: capped at PROCEED_WITH_PRECAUTIONS');
    reasonCodes.push('STALE_DATA_FLOOR');
  }

  const maxDurationMinutes = Math.min(
    aqiResult.maxMinutes ?? 999,
    heatResult.maxMinutes ?? 999
  );

  // P-2 Fix: If decision is MODIFY, shade is mandatory under all circumstances
  const requiresShade = heatResult.requiresShade || finalDecision === 'MODIFY';

  return {
    decision: finalDecision,
    aqiDecision: aqiResult.decision,
    heatDecision: heatResult.decision,
    reasons,
    reasonCodes,
    maxDurationMinutes: maxDurationMinutes === 999 ? undefined : maxDurationMinutes,
    requiresShade,
    isStale,
    isModeled,
    policyVersion: policyConfig.version,
    hasRespiratoryCondition
  };
}
