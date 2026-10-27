import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  environmentName: string;
}

export class StorageStack extends cdk.Stack {
  public readonly readingsTable: dynamodb.Table;
  public readonly decisionsTable: dynamodb.Table;
  public readonly vectorsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Primary readings table specified in Day 1 handover
    this.readingsTable = new dynamodb.Table(this, 'AirQualityReadings', {
      tableName: `AirSafe-Readings-${props.environmentName}`,
      partitionKey: { name: 'school_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-Demand = $0 when idle
      timeToLiveAttribute: 'ttl', // Auto-cleanup raw records after 30 days
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false, // Avoid PITR charges on Free Tier
    });

    // Secondary table for school decisions, overrides, and routines
    this.decisionsTable = new dynamodb.Table(this, 'SchoolDecisions', {
      tableName: `AirSafe-Decisions-${props.environmentName}`,
      partitionKey: { name: 'school_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'activity_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // A-5: S3 Bucket for Titan Policy Vectors & Knowledge Base
    this.vectorsBucket = new s3.Bucket(this, 'PolicyVectorsBucket', {
      bucketName: `airsafe-policy-vectors-${props.environmentName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
    });

    // Add tags for cost tracking per Section 9
    cdk.Tags.of(this).add('project', 'airsafe');
    cdk.Tags.of(this).add('environment', props.environmentName);
  }
}
