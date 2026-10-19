import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  environmentName: string;
}

export class StorageStack extends cdk.Stack {
  public readonly readingsTable: dynamodb.Table;
  public readonly decisionsTable: dynamodb.Table;

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

    // Add tags for cost tracking per Section 9
    cdk.Tags.of(this).add('project', 'airsafe');
    cdk.Tags.of(this).add('environment', props.environmentName);
  }
}
