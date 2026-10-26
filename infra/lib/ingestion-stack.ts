import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export interface IngestionStackProps extends cdk.StackProps {
  environmentName: string;
  readingsTable: dynamodb.Table;
}

export class IngestionStack extends cdk.Stack {
  public readonly pollerFunction: lambda.Function;
  public readonly sqsProcessorFunction: lambda.Function;
  public readonly ingestionQueue: sqs.Queue;
  public readonly ingestionDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: IngestionStackProps) {
    super(scope, id, props);

    // 1. SQS Dead Letter Queue (DLQ) for poisoned / malformed messages (Section 9 Cost & Reliability)
    this.ingestionDlq = new sqs.Queue(this, 'IngestionDlq', {
      queueName: `airsafe-ingestion-dlq-${props.environmentName}`,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true,
    });

    // 2. SQS Ingestion Queue with DLQ redrive policy (maxReceiveCount: 3)
    this.ingestionQueue = new sqs.Queue(this, 'IngestionQueue', {
      queueName: `airsafe-ingestion-queue-${props.environmentName}`,
      visibilityTimeout: cdk.Duration.seconds(90),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: this.ingestionDlq,
      },
      enforceSSL: true,
    });

    // 3. Dedicated CloudWatch Log Group with 14 days retention (Section 9 Cost Rule)
    const logGroup = new logs.LogGroup(this, 'PollerLogGroup', {
      logGroupName: `/aws/lambda/airsafe-poller-${props.environmentName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4. Poller Lambda Function (OpenAQ & Open-Meteo)
    this.pollerFunction = new lambda.Function(this, 'OpenAqPollerFunction', {
      functionName: `airsafe-poller-${props.environmentName}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../services/poller/dist')),
      architecture: lambda.Architecture.ARM_64, // Cost-efficient Graviton
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: props.readingsTable.tableName,
        OPENAQ_PARAM_NAME: '/airsafe/openaq/api-key',
        FCM_PARAM_NAME: '/airsafe/fcm/service-account',
        PROJECT_REGION: this.region,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // 5. High-Throughput SQS Sensor Ingestion Processor Lambda (Handles 200 ev/s burst)
    const sqsLogGroup = new logs.LogGroup(this, 'SqsProcessorLogGroup', {
      logGroupName: `/aws/lambda/airsafe-sqs-processor-${props.environmentName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.sqsProcessorFunction = new lambda.Function(this, 'SqsProcessorFunction', {
      functionName: `airsafe-sqs-processor-${props.environmentName}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'sqsProcessor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../services/poller/dist')),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: props.readingsTable.tableName,
        PROJECT_REGION: this.region,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: sqsLogGroup,
    });

    // Grant DynamoDB write permissions (least-privilege per S-04)
    props.readingsTable.grantReadWriteData(this.pollerFunction);
    props.readingsTable.grantReadWriteData(this.sqsProcessorFunction);

    // Event Source Mapping: SQS Ingestion Queue -> SqsProcessorFunction
    this.sqsProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.ingestionQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(2),
        reportBatchItemFailures: true,
      })
    );

    // Grant Amazon Bedrock permissions for Nova Micro anomaly classification (F-23)
    const bedrockAnomalyStatement = new iam.PolicyStatement({
      sid: 'AllowBedrockNovaMicroInvocation',
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*::foundation-model/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:*`,
      ],
    });
    this.pollerFunction.addToRolePolicy(bedrockAnomalyStatement);
    this.sqsProcessorFunction.addToRolePolicy(bedrockAnomalyStatement);

    // Grant SSM parameter store read access for secrets
    this.pollerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/openaq/api-key`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/fcm/service-account`,
        ],
      })
    );

    // EventBridge Rule: Run once an hour to conserve free tier limits (Section 5 / Section 9)
    const pollerRule = new events.Rule(this, 'HourlyPollerRule', {
      ruleName: `airsafe-hourly-poller-${props.environmentName}`,
      description: 'Trigger OpenAQ and Open-Meteo polling on schedule',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });

    pollerRule.addTarget(new targets.LambdaFunction(this.pollerFunction));

    cdk.Tags.of(this).add('project', 'airsafe');
    cdk.Tags.of(this).add('environment', props.environmentName);
  }
}
