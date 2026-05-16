import { App } from 'aws-cdk-lib';
import { FlowmintIamStack } from '../lib/iam/flowmint-iam-stack';
import { FlowmintDatabaseStack } from '../lib/data/flowmint-database-stack';
import { FlowmintCognitoStack } from '../lib/auth/flowmint-cognito-stack';
import { FlowmintEdgeStack } from '../lib/edge/flowmint-edge-stack';
import { FlowmintFrontendStack } from '../lib/edge/flowmint-frontend-stack';
import { SplitwiseNetworkStack } from '../lib/network/splitwise-network-stack';
import { SplitwiseAlbStack } from '../lib/network/splitwise-alb-stack';
import { SplitwiseDataStack } from '../lib/data/splitwise-data-stack';
import { SplitwiseEcrStack } from '../lib/compute/splitwise-ecr-stack';
import { SplitwiseClusterStack } from '../lib/compute/splitwise-cluster-stack';
import { SplitwiseTaskStack } from '../lib/compute/splitwise-task-stack';
import { SplitwiseEcsRolesStack } from '../lib/iam/splitwise-ecs-roles-stack';
import { getSecureParam } from '../lib/utils/parameter-utils';

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

const envConfig = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const googleClientId = getSecureParam('/flowmint/cognito/google-client-id');
const googleClientSecret = getSecureParam('/flowmint/cognito/google-client-secret');

const iamStack = new FlowmintIamStack(app, `${appName}-${envName}-iam`, {
  appName,
  envName,
  env: envConfig
});

const databaseStack = new FlowmintDatabaseStack(app, `${appName}-${envName}-database`, {
  appName,
  envName,
  env: envConfig
});
databaseStack.addDependency(iamStack);

const frontendStack = new FlowmintFrontendStack(app, `${appName}-${envName}-frontend`, {
  appName,
  envName,
  env: envConfig,
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
  googleClientId,
  googleClientSecret,
  env: envConfig
});
cognitoStack.addDependency(iamStack);
cognitoStack.addDependency(edgeStack);

const splitwiseNetworkStack = new SplitwiseNetworkStack(app, `${appName}-${envName}-splitwise-network`, {
  appName,
  envName,
  env: envConfig
});

const splitwiseAlbStack = new SplitwiseAlbStack(app, `${appName}-${envName}-splitwise-alb`, {
  appName,
  envName,
  env: envConfig,
  vpc: splitwiseNetworkStack.vpc,
  albSecurityGroup: splitwiseNetworkStack.albSecurityGroup
});
splitwiseAlbStack.addDependency(splitwiseNetworkStack);

const splitwiseDataStack = new SplitwiseDataStack(app, `${appName}-${envName}-splitwise-data`, {
  appName,
  envName,
  env: envConfig,
  vpc: splitwiseNetworkStack.vpc,
  rdsSecurityGroup: splitwiseNetworkStack.rdsSecurityGroup
});
splitwiseDataStack.addDependency(splitwiseNetworkStack);

const splitwiseEcrStack = new SplitwiseEcrStack(app, `${appName}-${envName}-splitwise-ecr`, {
  appName,
  envName,
  env: envConfig
});

const splitwiseClusterStack = new SplitwiseClusterStack(app, `${appName}-${envName}-splitwise-cluster`, {
  appName,
  envName,
  env: envConfig,
  vpc: splitwiseNetworkStack.vpc
});
splitwiseClusterStack.addDependency(splitwiseNetworkStack);

const splitwiseEcsRolesStack = new SplitwiseEcsRolesStack(app, `${appName}-${envName}-splitwise-ecs-roles`, {
  appName,
  envName,
  env: envConfig,
  repositoryArn: splitwiseEcrStack.repositoryArn,
  dbSecretArn: splitwiseDataStack.dbSecret.secretArn
});
splitwiseEcsRolesStack.addDependency(splitwiseEcrStack);
splitwiseEcsRolesStack.addDependency(splitwiseDataStack);

const splitwiseTaskStack = new SplitwiseTaskStack(app, `${appName}-${envName}-splitwise-task`, {
  appName,
  envName,
  env: envConfig,
  ecsSecurityGroup: splitwiseNetworkStack.ecsSecurityGroup,
  repositoryUri: splitwiseEcrStack.repositoryUri,
  taskExecutionRole: splitwiseEcsRolesStack.taskExecutionRole,
  taskRole: splitwiseEcsRolesStack.taskRole,
  dbEndpoint: splitwiseDataStack.dbEndpoint,
  dbSecretArn: splitwiseDataStack.dbSecret.secretArn,
  cluster: splitwiseClusterStack.cluster,
  logGroup: splitwiseClusterStack.logGroup,
  targetGroup: splitwiseAlbStack.targetGroup
});
splitwiseTaskStack.addDependency(splitwiseNetworkStack);
splitwiseTaskStack.addDependency(splitwiseAlbStack);
splitwiseTaskStack.addDependency(splitwiseDataStack);
splitwiseTaskStack.addDependency(splitwiseEcrStack);
splitwiseTaskStack.addDependency(splitwiseClusterStack);
splitwiseTaskStack.addDependency(splitwiseEcsRolesStack);

app.synth();