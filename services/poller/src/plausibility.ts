import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export type AnomalyCategory = 'SENSOR_MALFUNCTION' | 'LOCALIZED_EVENT' | 'PLAUSIBLE_WEATHER_EVENT';

export interface SensorTelemetryInput {
  temp_c: number;
  rh_pct: number;
  pm25_ugm3: number;
  ts?: string;
  sensor_id?: string;
  school_id?: string;
}

export interface DeltaCheckResult {
  isAnomalous: boolean;
  flags: string[];
  deltas: {
    tempDeltaC?: number;
    rhDeltaPct?: number;
    pm25DeltaUgm3?: number;
    districtPm25DeltaUgm3?: number;
    elapsedMinutes?: number;
  };
  reasoning: string;
}

export interface AnomalyClassificationResult {
  category: AnomalyCategory;
  confidence: number;
  explanation: string;
  model: string;
  flags: string[];
}

/**
 * F-23: Delta limits validation and cross-check against regional district stations
 * - Max 5°C/hr shift in temperature
 * - Max 50 µg/m³ sudden spike in PM2.5 within 15 minutes
 * - Max 40% RH shift within 15 minutes
 * - Plausibility bounds: Temp in [15, 50]°C, RH in [10, 100]%, PM2.5 in [0, 1000] µg/m³
 * - Regional cross-check against district monitoring baseline
 */
export function performDeltaCheck(
  current: SensorTelemetryInput,
  prior?: SensorTelemetryInput | null,
  districtBaseline?: { temp_c?: number; rh_pct?: number; pm25_ugm3?: number } | null
): DeltaCheckResult {
  const flags: string[] = [];
  const deltas: DeltaCheckResult['deltas'] = {};

  // 1. Physical Plausibility Bounds Check
  if (current.temp_c < 15.0 || current.temp_c > 50.0) {
    flags.push('TEMP_OUT_OF_BOUNDS');
  }
  if (current.rh_pct < 10.0 || current.rh_pct > 100.0) {
    flags.push('RH_OUT_OF_BOUNDS');
  }
  if (current.pm25_ugm3 < 0.0 || current.pm25_ugm3 > 1000.0) {
    flags.push('PM25_OUT_OF_BOUNDS');
  }

  // 2. Delta Check against Prior Reading
  if (prior) {
    const tempDelta = Math.abs(current.temp_c - prior.temp_c);
    const rhDelta = Math.abs(current.rh_pct - prior.rh_pct);
    const pm25Delta = current.pm25_ugm3 - prior.pm25_ugm3;

    deltas.tempDeltaC = Math.round(tempDelta * 10) / 10;
    deltas.rhDeltaPct = Math.round(rhDelta * 10) / 10;
    deltas.pm25DeltaUgm3 = Math.round(pm25Delta * 10) / 10;

    let elapsedMinutes = 15;
    if (current.ts && prior.ts) {
      const diffMs = Math.abs(new Date(current.ts).getTime() - new Date(prior.ts).getTime());
      elapsedMinutes = Math.max(1, Math.round(diffMs / 60000));
      deltas.elapsedMinutes = elapsedMinutes;
    }

    // Rate-of-change: max 5°C per hour
    const hourlyTempRate = (tempDelta / elapsedMinutes) * 60;
    if (hourlyTempRate > 5.0) {
      flags.push('EXCESSIVE_TEMP_DELTA_RATE');
    }

    // Sudden PM2.5 spike > 50 µg/m³ in <= 15 minutes
    if (elapsedMinutes <= 15 && pm25Delta > 50.0) {
      flags.push('PM25_SUDDEN_SPIKE');
    }

    // Sudden RH shift > 40% in <= 15 minutes
    if (elapsedMinutes <= 15 && rhDelta > 40.0) {
      flags.push('RH_SUDDEN_SHIFT');
    }
  }

  // 3. Cross-Check against Regional District Baseline
  if (districtBaseline && typeof districtBaseline.pm25_ugm3 === 'number') {
    const districtDelta = current.pm25_ugm3 - districtBaseline.pm25_ugm3;
    deltas.districtPm25DeltaUgm3 = Math.round(districtDelta * 10) / 10;

    // Diverges significantly from district baseline (> 4x baseline & delta > 80 µg/m³)
    if (current.pm25_ugm3 > 80 && districtBaseline.pm25_ugm3 > 0 && current.pm25_ugm3 > districtBaseline.pm25_ugm3 * 4) {
      flags.push('DISTRICT_BASELINE_DIVERGENCE');
    }
  }

  const isAnomalous = flags.length > 0;
  const reasoning = isAnomalous
    ? `Anomalous sensor delta detected: ${flags.join(', ')}`
    : 'Telemetry within normal plausible bounds and delta rates.';

  return {
    isAnomalous,
    flags,
    deltas,
    reasoning,
  };
}

/**
 * Fallback deterministic anomaly classifier for offline/test environments
 */
export function classifyAnomalyHeuristic(
  current: SensorTelemetryInput,
  flags: string[],
  _prior?: SensorTelemetryInput | null
): AnomalyClassificationResult {
  // If sensor reports impossible bounds or negative PM2.5 or NaN
  if (
    flags.includes('TEMP_OUT_OF_BOUNDS') ||
    flags.includes('RH_OUT_OF_BOUNDS') ||
    flags.includes('PM25_OUT_OF_BOUNDS') ||
    !Number.isFinite(current.temp_c) ||
    !Number.isFinite(current.rh_pct) ||
    !Number.isFinite(current.pm25_ugm3)
  ) {
    return {
      category: 'SENSOR_MALFUNCTION',
      confidence: 0.98,
      explanation: 'Readings exceed physical bounds or contain uncalibrated hardware values.',
      model: 'heuristic-rule-engine',
      flags,
    };
  }

  // If PM2.5 spiked drastically while temperature is steady, likely localized smoke/dust plume
  if (flags.includes('PM25_SUDDEN_SPIKE') || flags.includes('DISTRICT_BASELINE_DIVERGENCE')) {
    return {
      category: 'LOCALIZED_EVENT',
      confidence: 0.92,
      explanation: 'Transient particulate spike isolated to campus sensor (e.g. nearby biomass burning, brick kiln plume, or construction dust).',
      model: 'heuristic-rule-engine',
      flags,
    };
  }

  // Rapid temperature & humidity shift, likely sudden rain or thunderstorm front
  if (flags.includes('EXCESSIVE_TEMP_DELTA_RATE') || flags.includes('RH_SUDDEN_SHIFT')) {
    return {
      category: 'PLAUSIBLE_WEATHER_EVENT',
      confidence: 0.88,
      explanation: 'Rapid microclimate shift consistent with localized weather front or convective rainfall.',
      model: 'heuristic-rule-engine',
      flags,
    };
  }

  return {
    category: 'LOCALIZED_EVENT',
    confidence: 0.75,
    explanation: 'Unclassified anomaly classified as localized transient event.',
    model: 'heuristic-rule-engine',
    flags,
  };
}

/**
 * F-23: Anomaly classification using Amazon Bedrock Nova Micro (amazon.nova-micro-v1:0)
 * Uses Nova Micro to classify whether the anomaly is SENSOR_MALFUNCTION, LOCALIZED_EVENT, or PLAUSIBLE_WEATHER_EVENT.
 */
export async function classifyAnomalyWithNovaMicro(params: {
  current: SensorTelemetryInput;
  flags: string[];
  deltas: DeltaCheckResult['deltas'];
  prior?: SensorTelemetryInput | null;
  districtBaseline?: { temp_c?: number; rh_pct?: number; pm25_ugm3?: number } | null;
  bedrockClient?: BedrockRuntimeClient;
  modelId?: string;
}): Promise<AnomalyClassificationResult> {
  const modelId = params.modelId || process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';

  let client = params.bedrockClient;
  if (!client && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_REGION)) {
    try {
      const region = process.env.AWS_REGION || process.env.PROJECT_REGION || 'ap-southeast-2';
      client = new BedrockRuntimeClient({ region });
    } catch {
      // Bedrock client init error
    }
  }

  if (!client) {
    return classifyAnomalyHeuristic(params.current, params.flags, params.prior);
  }

  const prompt = `You are an automated environmental IoT anomaly classifier for school safety monitoring in Bangladesh.
A microclimate sensor reading was flagged with the following anomaly delta flags: [${params.flags.join(', ')}].

Telemetric Details:
- Current Reading: Temp=${params.current.temp_c}°C, RH=${params.current.rh_pct}%, PM2.5=${params.current.pm25_ugm3} µg/m³
- Prior Reading: ${params.prior ? `Temp=${params.prior.temp_c}°C, RH=${params.prior.rh_pct}%, PM2.5=${params.prior.pm25_ugm3} µg/m³` : 'None'}
- District Regional Baseline: ${params.districtBaseline ? `PM2.5=${params.districtBaseline.pm25_ugm3} µg/m³` : 'None'}
- Computed Deltas: ${JSON.stringify(params.deltas)}

Classify this anomaly into exactly one of these 3 categories:
1. SENSOR_MALFUNCTION: Hardware failure, open/short circuit, water damage, or uncalibrated probe.
2. LOCALIZED_EVENT: Real local transient event (e.g. nearby biomass burning, trash fire, generator exhaust, brick kiln plume, construction dust).
3. PLAUSIBLE_WEATHER_EVENT: Rapid meteorological event (e.g. nor'wester/kalbaishakhi squall, sudden thunderstorm, temperature drop from rain front).

Respond with ONLY a valid JSON object matching this schema:
{
  "category": "SENSOR_MALFUNCTION" | "LOCALIZED_EVENT" | "PLAUSIBLE_WEATHER_EVENT",
  "confidence": number between 0.50 and 0.99,
  "explanation": "concise 1-2 sentence engineering justification"
}`;

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 200,
          temperature: 0.1,
        },
      })
    );

    const textContent = response.output?.message?.content?.[0]?.text;
    if (textContent) {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validCategories: AnomalyCategory[] = ['SENSOR_MALFUNCTION', 'LOCALIZED_EVENT', 'PLAUSIBLE_WEATHER_EVENT'];
        const category: AnomalyCategory = validCategories.includes(parsed.category) ? parsed.category : 'LOCALIZED_EVENT';
        const confidence = typeof parsed.confidence === 'number' ? Math.min(0.99, Math.max(0.5, parsed.confidence)) : 0.85;

        return {
          category,
          confidence,
          explanation: parsed.explanation || 'Classified by Amazon Bedrock Nova Micro.',
          model: modelId,
          flags: params.flags,
        };
      }
    }
  } catch (err: any) {
    console.warn('[Nova Micro Anomaly Warning]: Fallback to heuristic classifier:', err?.message);
  }

  return classifyAnomalyHeuristic(params.current, params.flags, params.prior);
}
