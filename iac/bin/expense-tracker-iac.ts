import { App } from 'aws-cdk-lib';
import { ExpenseTrackerIamStack } from '../lib/expense-tracker-iam-stack';
import { ExpenseTrackerDatabaseStack } from '../lib/expense-tracker-database-stack';
import { ExpenseTrackerCognitoStack } from '../lib/expense-tracker-cognito-stack';
import { ExpenseTrackerEdgeStack } from '../lib/expense-tracker-edge-stack';
import { ExpenseTrackerFrontendStack } from '../lib/expense-tracker-frontend-stack';

const app = new App();

const appName = 'expense-tracker';
const envName = app.node.tryGetContext('env') || 'dev';
const cloudfrontDomain = app.node.tryGetContext('cloudfrontDomain');
if (!cloudfrontDomain) {
  throw new Error(
    'Missing required context: cloudfrontDomain. ' +
    'Pass it via: --context cloudfrontDomain=<value>. '
  );
}

const iamStack = new ExpenseTrackerIamStack(app, `${appName}-${envName}-iam`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

const databaseStack = new ExpenseTrackerDatabaseStack(app, `${appName}-${envName}-database`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
databaseStack.addDependency(iamStack);

const frontendStack = new ExpenseTrackerFrontendStack(app, `${appName}-${envName}-frontend`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  crossRegionReferences: true
});
frontendStack.addDependency(iamStack);

const edgeStack = new ExpenseTrackerEdgeStack(app, `${appName}-${envName}-edge`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1'
  },
  bucketName: frontendStack.bucketName,
  bucketRegionalDomainName: frontendStack.bucketRegionalDomainName,
  crossRegionReferences: true
});
edgeStack.addDependency(frontendStack);

const cognitoStack = new ExpenseTrackerCognitoStack(app, `${appName}-${envName}-cognito`, {
  appName,
  envName,
  cloudfrontDomain,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
cognitoStack.addDependency(iamStack);
cognitoStack.addDependency(edgeStack);

app.synth();
