import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { execSync } from 'child_process';

/**
 * Reads a SecureString from SSM at CDK synth time.
 * Used for secrets that must be known at synthesis (not deploy)
 * because they're embedded directly into CDK resources.
 */
export const getSecureParam = (name: string): string => {
  const result = execSync(
    `aws ssm get-parameter --name ${name} --with-decryption --query Parameter.Value --output text --region ${process.env.CDK_DEFAULT_REGION ?? 'ap-south-1'}`,
    { encoding: 'utf-8' }
  ).trim();
  if (!result) throw new Error(`SSM parameter ${name} not found or empty`);
  return result;
};

/**
 * Creates an SSM StringParameter to export a value for other stacks or pipelines.
 */
export const exportParam = (scope: Construct, appName: string, envName: string, domain: string, name: string, value: string) => {
  new ssm.StringParameter(scope, `SSMParam-${name}`, {
    parameterName: `/${appName}/${envName}/${domain}/${name}`,
    stringValue: value,
    description: `${appName} ${envName} ${domain} — ${name}`
  });
};
