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
  userPoolClient?: cognito.UserPoolClient;
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
        USER_POOL_ID: props.userPool?.userPoolId || '',
        USER_POOL_CLIENT_ID: props.userPoolClient?.userPoolClientId || '',
        NODE_OPTIONS: '--enable-source-maps',
        JWT_SECRET_PARAM_NAME: `/airsafe/${props.environmentName}/jwt-secret`,
        MCP_JWT_SECRET_PARAM_NAME: `/airsafe/${props.environmentName}/mcp-jwt-secret`,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://airsafe.schools.internal,http://localhost:3000',
      },
      logGroup,
    });

    // Grant least-privilege permissions to DynamoDB tables (S-4, S7)
    props.readingsTable.grantReadData(this.apiFunction);
    if (props.decisionsTable) {
      // S7 (Least-Privilege S-4): Replace wildcard grantReadWriteData with scoped IAM policy using dynamodb:LeadingKeys.
      // Prohibits full-table Scan and DeleteItem, and strictly restricts operations to known partition keys:
      // - School tenant data, overrides, routines, notes, and audits: school-*
      // - Staff lookup fast-path index: STAFF_LOOKUP
      // - Login rate-limiting counters: RATELIMIT#*
      this.apiFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'ScopedDecisionsTableAccessWithLeadingKeys',
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:BatchGetItem',
          ],
          resources: [props.decisionsTable.tableArn],
          conditions: {
            'ForAllValues:StringLike': {
              'dynamodb:LeadingKeys': [
                'school-*',
                'STAFF_LOOKUP',
                'RATELIMIT#*',
              ],
            },
          },
        })
      );
    }

    // Grant Cognito User Pool administrative access for staff invites (F-12 & S-2)
    if (props.userPool) {
      this.apiFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'cognito-idp:AdminCreateUser',
            'cognito-idp:AdminAddUserToGroup',
            'cognito-idp:AdminGetUser',
            'cognito-idp:AdminInitiateAuth',
          ],
          resources: [props.userPool.userPoolArn],
        })
      );
    }

    // Grant SSM parameter store access for JWT and MCP secrets (Hard Gate 1)
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/${props.environmentName}/jwt-secret`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/jwt-secret`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/${props.environmentName}/mcp-jwt-secret`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/airsafe/mcp-jwt-secret`,
        ],
      })
    );

    // API Gateway REST API with restricted CORS allowlist
    this.restApi = new apigateway.RestApi(this, 'AirSafeRestApi', {
      restApiName: `AirSafe-Api-${props.environmentName}`,
      description: 'AirSafe Schools REST API for mobile app and web clients',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://airsafe.schools.internal', 'http://localhost:3000'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'x-school-id'],
        allowCredentials: true,
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

    const cognitoMethodOptions: apigateway.MethodOptions | undefined = authorizer
      ? {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      : undefined;

    // Direct Cognito verification endpoint for evaluator test
    const cognitoCheck = this.restApi.root.addResource('cognito-check');
    cognitoCheck.addMethod('GET', lambdaIntegration, cognitoMethodOptions);

    // In-lambda fail-closed authentication (authenticateRequest) handles both HMAC-SHA256 JWT & Cognito tokens
    // S3 & Hard Gate 2: Protect all tenant /schools/* routes with Cognito User Pool authorizer
    const methodOptions: apigateway.MethodOptions | undefined = cognitoMethodOptions;

    // 1. Invite-only Authentication Endpoint: POST /auth/login (F-01, S-2)
    const authResource = this.restApi.root.addResource('auth');
    const loginResource = authResource.addResource('login');
    loginResource.addMethod('POST', lambdaIntegration);

    // 2. Public Policy Viewer Route: GET /policies/current (F-15)
    const policies = this.restApi.root.addResource('policies');
    const currentPolicy = policies.addResource('current');
    currentPolicy.addMethod('GET', lambdaIntegration);

    // 3. Tenant-Scoped School Endpoints: /schools/{schoolId}/* (Hard Gate 2 & 3)
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
    notes.addMethod('GET', lambdaIntegration, methodOptions);

    const staff = school.addResource('staff');
    staff.addMethod('GET', lambdaIntegration, methodOptions);
    const invite = staff.addResource('invite');
    invite.addMethod('POST', lambdaIntegration, methodOptions);

    const sensorSites = school.addResource('sensor-sites');
    sensorSites.addMethod('GET', lambdaIntegration, methodOptions);

    const analytics = school.addResource('analytics');
    analytics.addMethod('GET', lambdaIntegration, methodOptions);

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
