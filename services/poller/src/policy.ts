/**
 * Model School Outdoor Activity Policy Implementation
 * Multi-version, config-driven thresholds loaded from policy configs.
 * S9: Supports automatic activation of new versions (e.g. v1.3.json) via effective_from
 * and dynamic registration from external sources (e.g. AWS S3) without code release.
 */

import policyV12 from './policy/v1.2.json';
import policyV13 from './policy/v1.3.json';

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

export interface PolicyBandAQI {
  max: number;
  code: string;
  defaultDecision: string;
  vigorousDecision: string;
  defaultMaxMinutes?: number;
  vigorousMaxMinutes?: number;
}

export interface PolicyBandHeat {
  max: number;
  code: string;
  lightDecision: string;
  defaultDecision: string;
  lightMaxMinutes?: number;
  defaultMaxMinutes?: number;
  requiresShade: boolean;
}

export interface Pm25Breakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

export interface PolicyConfig {
  version: string;
  name: string;
  effectiveDate: string;
  effective_from?: string;
  authority: string;
  aqiBands: PolicyBandAQI[];
  heatBands: PolicyBandHeat[];
  pm25Breakpoints: Pm25Breakpoint[];
}

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

// In-memory Policy Registry supporting multi-version resolution (S9)
const POLICY_REGISTRY: Map<string, PolicyConfig> = new Map([
  ['v1.2', policyV12 as PolicyConfig],
  ['v1.3', policyV13 as PolicyConfig],
]);

/**
 * Register or update a policy configuration at runtime (e.g. hydrated from S3: s3://${POLICY_S3_BUCKET}/policies/*.json)
 * without requiring application code changes or rebuilds (S9).
 */
export function registerPolicyConfig(config: PolicyConfig): void {
  if (config && config.version) {
    POLICY_REGISTRY.set(config.version, config);
  }
}

/**
 * Returns all registered policy configurations.
 */
export function getAllPolicyConfigs(): PolicyConfig[] {
  return Array.from(POLICY_REGISTRY.values());
}

/**
 * Resolves the active policy configuration based on effective_from date.
 * If targetDate is omitted, current system time (Date.now()) is used.
 * The latest policy whose effective_from <= targetDate is returned.
 */
export function getActivePolicyConfig(targetDate?: Date | string | number): PolicyConfig {
  const evalDate = targetDate ? new Date(targetDate) : new Date();
  const evalTime = evalDate.getTime();

  const sorted = getAllPolicyConfigs().sort((a, b) => {
    const timeA = new Date(a.effective_from || a.effectiveDate).getTime();
    const timeB = new Date(b.effective_from || b.effectiveDate).getTime();
    return timeA - timeB;
  });

  let activePolicy = sorted[0];
  for (const policy of sorted) {
    const policyTime = new Date(policy.effective_from || policy.effectiveDate).getTime();
    if (policyTime <= evalTime) {
      activePolicy = policy;
    }
  }

  return activePolicy;
}

// Default export preserving backward-compatibility with direct policyConfig imports
export const policyConfig = getActivePolicyConfig();
export default policyConfig;

/**
 * US EPA PM2.5 to AQI Piecewise-Linear Interpolation (Appendix B & EPA NowCast standard)
 * Formula: Ip = ((I_high - I_low) / (BP_high - BP_low)) * (Cp - BP_low) + I_low
 */
export function calculateAqiFromPm25(pm25: number, evaluationDate?: Date | string | number): number {
  if (!Number.isFinite(pm25) || pm25 < 0) {
    return 0;
  }
  const config = getActivePolicyConfig(evaluationDate);
  const c = Math.round(pm25 * 10) / 10;
  const breakpoints = config.pm25Breakpoints || [
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
  hasRespiratoryCondition: boolean = false,
  evaluationDate?: Date | string | number
): { decision: PolicyDecision; maxMinutes?: number; reasonCode: string } {
  if (!Number.isFinite(aqi)) {
    return { decision: 'MOVE_INDOORS', reasonCode: 'INVALID_AQI_VALUE' };
  }

  const config = getActivePolicyConfig(evaluationDate);
  const bands = config.aqiBands;
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
  intensity: ActivityIntensity,
  evaluationDate?: Date | string | number
): { decision: PolicyDecision; maxMinutes?: number; requiresShade: boolean; reasonCode: string } {
  if (!Number.isFinite(heatIndexC)) {
    return { decision: 'MOVE_INDOORS', requiresShade: true, reasonCode: 'INVALID_HEAT_VALUE' };
  }

  const config = getActivePolicyConfig(evaluationDate);
  const bands = config.heatBands;
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
  hasRespiratoryCondition: boolean = false,
  evaluationDate?: Date | string | number
): DecisionEvaluationResult {
  const config = getActivePolicyConfig(evaluationDate);

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
      policyVersion: config.version,
      hasRespiratoryCondition
    };
  }

  const aqiResult = evaluateAQIDecision(aqi, intensity, hasRespiratoryCondition, evaluationDate);
  const heatResult = evaluateHeatDecision(heatIndexC, intensity, evaluationDate);

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
    policyVersion: config.version,
    hasRespiratoryCondition
  };
}
