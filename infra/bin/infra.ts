#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { IngestionStack } from '../lib/ingestion-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

// Explicitly bind to Project Account and Sydney Region
const env: cdk.Environment = {
  account: '570088430516',
  region: 'ap-southeast-2',
};

const environmentName = 'dev';

// 1. Storage Stack (DynamoDB On-Demand)
const storageStack = new StorageStack(app, 'AirSafe-Storage-Dev', {
  env,
  environmentName,
  description: 'AirSafe Schools DynamoDB Tables (On-Demand / Free-tier)',
});

// 2. Auth Stack (Cognito User Pool, Groups)
const authStack = new AuthStack(app, 'AirSafe-Auth-Dev', {
  env,
  environmentName,
  description: 'AirSafe Schools Cognito Auth (Invite-only)',
});

// 3. Ingestion Stack (Poller Lambda + Scheduler)
const ingestionStack = new IngestionStack(app, 'AirSafe-Ingestion-Dev', {
  env,
  environmentName,
  readingsTable: storageStack.readingsTable,
  description: 'AirSafe Schools Sensor Poller & Scheduler',
});

// 4. API Stack (REST API Gateway + Current Decision + Cognito Authorizer)
const apiStack = new ApiStack(app, 'AirSafe-Api-Dev', {
  env,
  environmentName,
  readingsTable: storageStack.readingsTable,
  decisionsTable: storageStack.decisionsTable,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  description: 'AirSafe Schools REST API Gateway & Handlers',
});

// Dependencies
ingestionStack.addDependency(storageStack);
apiStack.addDependency(storageStack);
apiStack.addDependency(authStack);

app.synth();
