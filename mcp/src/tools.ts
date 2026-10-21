/**
 * AirSafe Schools - Model Context Protocol (MCP) Shared Tool Library
 *
 * Implements tool schema definitions and strict tenant-boundary isolation
 * for Bedrock Nova / Claude agent interaction under Protocol Version 2024-11-05.
 *
 * Hard Gate 2:
 * - Scoped tokens are authenticated strictly in the execution context / headers.
 * - Schemas NEVER expose school_id or scoped_token to prevent cross-tenant leakage.
 */

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export const SHARED_TOOL_DEFINITIONS: McpToolSchema[] = [
  {
    name: 'get_school_decision',
    description: 'Fetch the real-time environmental decision (SAFE, CAUTION, MODIFY, MOVE_INDOORS), policy reasons, and metrics for the authenticated school.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_sensor_readings',
    description: 'Retrieve real-time microclimate sensor telemetry (temperature, humidity, heat index, PM2.5, AQI) for authenticated school locations.',
    inputSchema: {
      type: 'object',
      properties: {
        location_type: {
          type: 'string',
          description: 'Optional filter by sensor location type',
          enum: ['FIELD', 'COURTYARD', 'CLASSROOM']
        }
      },
      required: []
    }
  },
  {
    name: 'get_outdoor_policy',
    description: 'Retrieve official safety rules, threshold tables, and citations from Model School Outdoor Activity Policy v1.2.',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Optional section filter',
          enum: ['ALL', 'AQI_THRESHOLDS', 'HEAT_THRESHOLDS', 'DATA_QUALITY_CAPS', 'SENSITIVE_GROUPS']
        }
      },
      required: []
    }
  }
];

export interface SchoolDecisionResult {
  school_id: string;
  timestamp: string;
  status: 'SAFE' | 'CAUTION' | 'MODIFY' | 'MOVE_INDOORS' | 'UNKNOWN';
  decision: string;
  aqi_decision: string;
  heat_decision: string;
  reasons: string[];
  metrics: {
    pm25?: number;
    aqi?: number;
    temperature_c?: number;
    heat_index_c?: number;
    humidity?: number;
  };
  policy_citation: {
    policy_version: string;
    doc_id: string;
  };
  data_quality: {
    is_modeled: boolean;
    is_stale: boolean;
  };
}

export interface SensorReadingResult {
  school_id: string;
  location_type: string;
  timestamp: string;
  pm25: number;
  aqi: number;
  temperature_c: number;
  humidity: number;
  heat_index_c: number;
}
