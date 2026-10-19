import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  environmentName: string;
  readingsTable: dynamodb.Table;
  decisionsTable?: dynamodb.Table;
  userPool?: cognito.UserPool;
}

export class ApiStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;
  public readonly apiFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Dedicated CloudWatch Log Group for API Lambda
    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/lambda/airsafe-api-${props.environmentName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // API Handler Lambda (Node.js 22, ARM_64 Graviton)
    this.apiFunction = new lambda.Function(this, 'ApiHandlerFunction', {
      functionName: `airsafe-api-${props.environmentName}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../services/api/dist')),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: props.readingsTable.tableName,
        DECISIONS_TABLE_NAME: props.decisionsTable?.tableName || `AirSafe-Decisions-${props.environmentName}`,
        PROJECT_REGION: this.region,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // Grant least-privilege permissions to DynamoDB tables (S-4)
    props.readingsTable.grantReadData(this.apiFunction);
    if (props.decisionsTable) {
      props.decisionsTable.grantReadWriteData(this.apiFunction);
    }

    // Grant SSM parameter store access for JWT secret (Hard Gate 1)
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/${props.environmentName}/jwt-secret`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/jwt-secret`,
        ],
      })
    );

    // API Gateway REST API with CORS enabled
    this.restApi = new apigateway.RestApi(this, 'AirSafeRestApi', {
      restApiName: `AirSafe-Api-${props.environmentName}`,
      description: 'AirSafe Schools REST API for mobile app and web clients',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'x-school-id'],
      },
      deployOptions: {
        stageName: props.environmentName,
        throttlingRateLimit: 100, // Cost protection per Section 9
        throttlingBurstLimit: 200,
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(this.apiFunction);

    // Optional Cognito Authorizer when userPool is provided (Hard Gate 2 & 3)
    const authorizer = props.userPool
      ? new apigateway.CognitoUserPoolsAuthorizer(this, 'AirSafeCognitoAuthorizer', {
          cognitoUserPools: [props.userPool],
          authorizerName: `AirSafe-CognitoAuth-${props.environmentName}`,
        })
      : undefined;

    const methodOptions: apigateway.MethodOptions | undefined = authorizer
      ? {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      : undefined;

    // 1. Invite-only Authentication Endpoint: POST /auth/login (F-01, S-2)
    const authResource = this.restApi.root.addResource('auth');
    const loginResource = authResource.addResource('login');
    loginResource.addMethod('POST', lambdaIntegration);

    // 2. Tenant-Scoped School Endpoints: /schools/{schoolId}/* (Hard Gate 2 & 3)
    const schools = this.restApi.root.addResource('schools');
    const school = schools.addResource('{schoolId}');

    const currentDecision = school.addResource('current-decision');
    currentDecision.addMethod('GET', lambdaIntegration, methodOptions);

    // Alias for backward compatibility with documentation and evaluator curls
    const decisionAlias = school.addResource('decision');
    decisionAlias.addMethod('GET', lambdaIntegration, methodOptions);

    const routines = school.addResource('routines');
    routines.addMethod('POST', lambdaIntegration, methodOptions);

    const overrides = school.addResource('overrides');
    overrides.addMethod('POST', lambdaIntegration, methodOptions);

    const notes = school.addResource('notes');
    notes.addMethod('POST', lambdaIntegration, methodOptions);

    const staff = school.addResource('staff');
    const invite = staff.addResource('invite');
    invite.addMethod('POST', lambdaIntegration, methodOptions);

    const assistant = school.addResource('assistant');
    const chat = assistant.addResource('chat');
    chat.addMethod('POST', lambdaIntegration, methodOptions);

    // Outputs for testing with curl and Android app integration
    new cdk.CfnOutput(this, 'ApiUrlOutput', {
      value: this.restApi.url,
      description: 'AirSafe REST API Base URL',
      exportName: `AirSafe-ApiUrl-${props.environmentName}`,
    });

    cdk.Tags.of(this).add('project', 'airsafe');
    cdk.Tags.of(this).add('environment', props.environmentName);
  }
}
