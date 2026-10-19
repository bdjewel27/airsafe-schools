import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  environmentName: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Cognito User Pool: Invite-only (Self sign-up disabled per F-01 and S-02)
    this.userPool = new cognito.UserPool(this, 'AirSafeUserPool', {
      userPoolName: `AirSafe-Users-${props.environmentName}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      customAttributes: {
        school_id: new cognito.StringAttribute({ mutable: false }),
        role: new cognito.StringAttribute({ mutable: false }),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Client for Android Mobile App
    this.userPoolClient = new cognito.UserPoolClient(this, 'AirSafeAppClient', {
      userPool: this.userPool,
      userPoolClientName: `AirSafe-AndroidApp-${props.environmentName}`,
      generateSecret: false, // Public mobile client
      authFlows: {
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },
      preventUserExistenceErrors: true,
      // Hard Gate 3: Empty writeAttributes prevents client from writing custom:school_id or custom:role
      writeAttributes: new cognito.ClientAttributes(),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true })
        .withCustomAttributes('school_id', 'role'),
    });

    // Create groups: teacher, coordinator, platform-admin
    new cognito.CfnUserPoolGroup(this, 'TeacherGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'teacher',
      description: 'School teachers - read-only access to decisions & live status',
    });

    new cognito.CfnUserPoolGroup(this, 'CoordinatorGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'coordinator',
      description: 'School coordinators - manage activities, overrides & invites',
    });

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'platform-admin',
      description: 'Platform administrators - seed schools and coordinators',
    });

    cdk.Tags.of(this).add('project', 'airsafe');
    cdk.Tags.of(this).add('environment', props.environmentName);
  }
}
