import { App } from 'aws-cdk-lib';
import { ExpenseTrackerIamStack } from '../lib/expense-tracker-iam-stack';

const app = new App();

const appName = 'expense-tracker';
const envName = app.node.tryGetContext('env') || 'dev';

new ExpenseTrackerIamStack(app, `${appName}-iam-${envName}`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
