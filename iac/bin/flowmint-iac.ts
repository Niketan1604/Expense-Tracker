import { App } from 'aws-cdk-lib';
import { FlowmintIamStack } from '../lib/flowmint-iam-stack';
import { FlowmintDatabaseStack } from '../lib/flowmint-database-stack';
import { FlowmintCognitoStack } from '../lib/flowmint-cognito-stack';
import { FlowmintEdgeStack } from '../lib/flowmint-edge-stack';
import { FlowmintFrontendStack } from '../lib/flowmint-frontend-stack';

const app = new App();

const appName = 'flowmint';
const envName = app.node.tryGetContext('env') || 'dev';
const cloudfrontDomain = app.node.tryGetContext('cloudfrontDomain');
if (!cloudfrontDomain) {
  throw new Error(
    'Missing required context: cloudfrontDomain. ' +
    'Pass it via: --context cloudfrontDomain=<value>. '
  );
}

const iamStack = new FlowmintIamStack(app, `${appName}-${envName}-iam`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

const databaseStack = new FlowmintDatabaseStack(app, `${appName}-${envName}-database`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
databaseStack.addDependency(iamStack);

const frontendStack = new FlowmintFrontendStack(app, `${appName}-${envName}-frontend`, {
  appName,
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  crossRegionReferences: true
});
frontendStack.addDependency(iamStack);

const edgeStack = new FlowmintEdgeStack(app, `${appName}-${envName}-edge`, {
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

const cognitoStack = new FlowmintCognitoStack(app, `${appName}-${envName}-cognito`, {
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
