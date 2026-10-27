import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  generateTitanEmbedding,
  computeCosineSimilarity,
  chunkPolicyDocument,
  S3VectorStore,
  ingestPolicyLambdaHandler,
  PolicyDocumentInput,
} from '../ragIngest';
import { McpClient } from '../mcpClient';
import { executeBedrockStreamAssistantWithMcp } from '../bedrock';

describe('A-5: RAG Ingestion Pipeline (Titan -> S3 Vectors) & Dynamic Citation Updates', () => {
  let mockS3Client: any;
  let mockBedrockClient: any;

  beforeEach(() => {
    jest.restoreAllMocks();
    S3VectorStore.getInstance().clear();

    mockS3Client = {
      send: jest.fn().mockResolvedValue({}),
    };

    mockBedrockClient = {
      send: jest.fn(),
    };
  });

  afterEach(() => {
    S3VectorStore.getInstance().clear();
  });

  test('1. generateTitanEmbedding invokes amazon.titan-embed-text-v1 and produces float embedding vector', async () => {
    const fakeEmbedding = new Array(1536).fill(0.05);
    (mockBedrockClient.send as jest.Mock).mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify({ embedding: fakeEmbedding })),
    });

    const embedding = await generateTitanEmbedding('Model School Outdoor Activity Policy rules', mockBedrockClient);
    expect(embedding).toHaveLength(1536);
    expect(mockBedrockClient.send).toHaveBeenCalledTimes(1);

    const callArg = (mockBedrockClient.send as jest.Mock).mock.calls[0][0];
    expect(callArg.input.modelId).toBe('amazon.titan-embed-text-v1');
  });

  test('2. computeCosineSimilarity evaluates vector similarity correctly', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];
    expect(computeCosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    expect(computeCosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5);
  });

  test('3. Ingesting Document v1.2 populates vectors with doc_id, version, effective_from, and superseded=false', async () => {
    const store = new S3VectorStore({ s3Bucket: 'airsafe-policy-vectors-dev', s3Client: mockS3Client });
    S3VectorStore.setInstance(store);

    const docV12: PolicyDocumentInput = {
      doc_id: 'airsafe-policy-v1.2',
      version: 'v1.2',
      title: 'Model School Outdoor Activity Policy v1.2',
      effective_from: '2024-01-01T00:00:00Z',
      citation_id: 'Model School Outdoor Activity Policy v1.2, A 1–A 4',
      citation_excerpt: 'Outdoor activities governed by Policy v1.2 thresholds.',
      content: `Section A: Heat Index Thresholds.
When Heat Index is between 32.0°C and 38.9°C, proceed with precautions.
When Heat Index exceeds 39.0°C, outdoor activities must be modified or moved indoors.`,
    };

    const result = await store.ingestDocument(docV12, { s3Client: mockS3Client });
    expect(result.doc_id).toBe('airsafe-policy-v1.2');
    expect(result.version).toBe('v1.2');
    expect(result.chunks_ingested).toBeGreaterThan(0);
    expect(mockS3Client.send).toHaveBeenCalled();

    const vectors = store.getAllVectors();
    expect(vectors.length).toBeGreaterThan(0);

    for (const vec of vectors) {
      expect(vec.doc_id).toBe('airsafe-policy-v1.2');
      expect(vec.version).toBe('v1.2');
      expect(vec.effective_from).toBe('2024-01-01T00:00:00Z');
      expect(vec.superseded).toBe(false);
      expect(vec.citation_id).toBe('Model School Outdoor Activity Policy v1.2, A 1–A 4');
    }

    // Verify initial citation is v1.2
    const citationBefore = store.getActivePolicyCitation();
    expect(citationBefore.version).toBe('v1.2');
    expect(citationBefore.citation_id).toBe('Model School Outdoor Activity Policy v1.2, A 1–A 4');
  });

  test('4. Uploading Document v1.3 marks v1.2 as superseded=true and dynamically updates active citation to v1.3', async () => {
    const store = new S3VectorStore({ s3Bucket: 'airsafe-policy-vectors-dev', s3Client: mockS3Client });
    S3VectorStore.setInstance(store);

    // Initial ingestion of v1.2
    await store.ingestDocument(
      {
        doc_id: 'airsafe-policy-v1.2',
        version: 'v1.2',
        title: 'Model School Outdoor Activity Policy v1.2',
        effective_from: '2024-01-01T00:00:00Z',
        citation_id: 'Model School Outdoor Activity Policy v1.2, A 1–A 4',
        citation_excerpt: 'Policy v1.2 safety guidelines.',
        content: 'Original outdoor activity rules v1.2.',
      },
      { s3Client: mockS3Client }
    );

    expect(store.getActivePolicyCitation().citation_id).toBe('Model School Outdoor Activity Policy v1.2, A 1–A 4');

    // Upload new Document v1.3 (supersedes v1.2)
    const docV13: PolicyDocumentInput = {
      doc_id: 'airsafe-policy-v1.3',
      version: 'v1.3',
      title: 'Model School Outdoor Activity Policy v1.3 (Updated Ozone & Heat Index)',
      effective_from: '2026-10-25T00:00:00Z',
      citation_id: 'Model School Outdoor Activity Policy v1.3, Section A–D',
      citation_excerpt: 'Policy v1.3 updated safety guidelines with strict ozone monitoring.',
      content: `Section A: Revised Heat Index Thresholds v1.3.
Heat Index 38.0°C now mandates immediate shaded rest intervals.
Section B: Fine Particle PM2.5 and Ozone protocols reinforced for vulnerable students.`,
      supersedes_version: 'v1.2',
    };

    const ingestV13Result = await store.ingestDocument(docV13, { s3Client: mockS3Client });
    expect(ingestV13Result.doc_id).toBe('airsafe-policy-v1.3');
    expect(ingestV13Result.superseded_versions).toContain('v1.2');

    // Verify all vectors state: v1.2 is superseded, v1.3 is active
    const allVectors = store.getAllVectors();
    const v12Vectors = allVectors.filter((v) => v.version === 'v1.2');
    const v13Vectors = allVectors.filter((v) => v.version === 'v1.3');

    expect(v12Vectors.length).toBeGreaterThan(0);
    expect(v13Vectors.length).toBeGreaterThan(0);

    for (const v of v12Vectors) {
      expect(v.superseded).toBe(true); // v1.2 is superseded!
    }

    for (const v of v13Vectors) {
      expect(v.superseded).toBe(false); // v1.3 is active!
      expect(v.doc_id).toBe('airsafe-policy-v1.3');
      expect(v.effective_from).toBe('2026-10-25T00:00:00Z');
      expect(v.citation_id).toBe('Model School Outdoor Activity Policy v1.3, Section A–D');
    }

    // PROOF OF CITATION CHANGE: Active policy citation dynamically updated from v1.2 to v1.3!
    const citationAfter = store.getActivePolicyCitation();
    expect(citationAfter.version).toBe('v1.3');
    expect(citationAfter.citation_id).toBe('Model School Outdoor Activity Policy v1.3, Section A–D');
    expect(citationAfter.citation_excerpt).toContain('Policy v1.3 updated safety guidelines');
  });

  test('5. MCP Client and Bedrock Assistant dynamically reflect citation update from v1.2 to v1.3', async () => {
    const store = new S3VectorStore({ s3Bucket: 'airsafe-policy-vectors-dev', s3Client: mockS3Client });
    S3VectorStore.setInstance(store);

    const mcpClient = new McpClient({
      scopedToken: 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhaXJzYWZlLWNoYXQiLCJhdWQiOiJhaXJzYWZlLW1jcCIsInNjaG9vbF9pZCI6InNjaG9vbC1kaGFrYS0wMDEifQ.sig',
    });

    // Check baseline citation before upload
    const toolResultBefore = await mcpClient.callTool('get_outdoor_policy', {});
    expect(toolResultBefore.policy_version).toBe('v1.2');
    expect(toolResultBefore.citation_id).toContain('Policy v1.2');

    // Upload new document v1.3
    await store.ingestDocument(
      {
        doc_id: 'airsafe-policy-v1.3',
        version: 'v1.3',
        title: 'Model School Outdoor Activity Policy v1.3',
        effective_from: '2026-10-25T00:00:00Z',
        citation_id: 'Model School Outdoor Activity Policy v1.3, A 1–A 4',
        citation_excerpt: 'Outdoor activity decisions strictly bound by updated Policy v1.3.',
        content: 'Model School outdoor policy v1.3 revised rules.',
        supersedes_version: 'v1.2',
      },
      { s3Client: mockS3Client }
    );

    // Citation from MCP tool has changed to v1.3!
    const toolResultAfter = await mcpClient.callTool('get_outdoor_policy', {});
    expect(toolResultAfter.policy_version).toBe('v1.3');
    expect(toolResultAfter.citation_id).toBe('Model School Outdoor Activity Policy v1.3, A 1–A 4');

    // Bedrock streaming assistant response dynamically embeds v1.3 citation
    const assistantResponse = await executeBedrockStreamAssistantWithMcp({
      query: 'হিট ইনডেক্সের জন্য স্কুলের নতুন নীতিমালা কী?',
      schoolId: 'school-dhaka-001',
      schoolNameBn: 'ঢাকা মডেল স্কুল',
      schoolNameEn: 'Dhaka Model School',
      isBengali: true,
      decision: 'MODIFY',
      policyFloorDecision: 'MODIFY',
      heatIndexC: 36.5,
      aqi: 90,
      activeIntensity: 'moderate',
      routineNameBn: 'পিই ক্লাস',
      routineNameEn: 'PE Class',
      nextActivityBn: null,
      nextActivityEn: null,
      hasRespiratoryCondition: false,
      isStale: false,
      activeOverride: null,
      primaryReason: 'হিট ইনডেক্স ৩৬.৫°C',
      maxDurationMinutes: 30,
      requiresShade: true,
    });

    expect(assistantResponse.citationId).toBe('Model School Outdoor Activity Policy v1.3, A 1–A 4');
    expect(assistantResponse.docId).toBe('airsafe-policy-v1.3');
  });

  test('6. Ingest Lambda Handler processes document ingestion event and returns 200 SUCCESS', async () => {
    const store = new S3VectorStore({ s3Bucket: 'airsafe-policy-vectors-dev', s3Client: mockS3Client });
    S3VectorStore.setInstance(store);

    const event = {
      body: JSON.stringify({
        doc_id: 'airsafe-policy-v1.3',
        version: 'v1.3',
        title: 'Model School Outdoor Activity Policy v1.3',
        effective_from: '2026-10-25T00:00:00Z',
        citation_id: 'Model School Outdoor Activity Policy v1.3, A 1–A 4',
        citation_excerpt: 'Policy v1.3 updated constraints.',
        content: 'Revised thresholds for high temperature outdoor drills.',
        supersedes_version: 'v1.2',
      }),
    };

    const lambdaRes = await ingestPolicyLambdaHandler(event);
    expect(lambdaRes.statusCode).toBe(200);

    const body = JSON.parse(lambdaRes.body);
    expect(body.status).toBe('SUCCESS');
    expect(body.ingest_summary.version).toBe('v1.3');
    expect(body.ingest_summary.new_active_citation).toBe('Model School Outdoor Activity Policy v1.3, A 1–A 4');
  });
});
