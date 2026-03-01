import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CfnExecutionPlan } from 'aws-cdk-lib/aws-kendraranking';

interface IamStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class ExpenseTrackerIamStack extends Stack {

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;

    const exportParam = (name: string, value: string) => {
      new ssm.StringParameter(this, `SSMParam-${name}`, {
        parameterName: `/${appName}/${envName}/iam/${name}`,
        stringValue: value,
        description: `${appName} ${envName} iam — ${name}`
      });
    };

    // =========================================================
    // Permission Boundary (limits cfn-execution-role max perms)
    // Tightly scoped to only appName/envName resources
    // =========================================================
    const permissionBoundary = new iam.ManagedPolicy(this, 'PermissionBoundary', {
      managedPolicyName: `${appName}-${envName}-permission-boundary`,
      statements: [
        // S3 - only app buckets
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:*'],
          resources: [
            `arn:aws:s3:::${appName}-${envName}-*`,
            `arn:aws:s3:::${appName}-${envName}-*/*`,
            // CDK bootstrap bucket (needed for asset uploads)
            `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}`,
            `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`
          ]
        }),
        // DynamoDB - only app tables
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:*'],
          resources: [
            `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*`,
            `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*/index/*`,
            `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*/stream/*`
          ]
        }),
        // Lambda - only app functions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:*'],
          resources: [
            `arn:aws:lambda:${this.region}:${this.account}:function:${appName}-${envName}-*`,
            `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*`,
            `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*:*`
          ]
        }),
        // API Gateway - scoped to account/region
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['apigateway:*'],
          resources: [
            `arn:aws:apigateway:${this.region}::/restapis`,
            `arn:aws:apigateway:${this.region}::/restapis/*`,
            `arn:aws:apigateway:${this.region}::/apis`,
            `arn:aws:apigateway:${this.region}::/apis/*`,
            `arn:aws:apigateway:${this.region}::/domainnames`,
            `arn:aws:apigateway:${this.region}::/domainnames/*`
          ]
        }),
        // CloudFront - distributions only (global, no region)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cloudfront:*'],
          resources: [
            `arn:aws:cloudfront::${this.account}:distribution/*`,
            `arn:aws:cloudfront::${this.account}:origin-access-identity/*`,
            `arn:aws:cloudfront::${this.account}:origin-access-control/*`,
            `arn:aws:cloudfront::${this.account}:cache-policy/*`,
            `arn:aws:cloudfront::${this.account}:origin-request-policy/*`
          ]
        }),
        // ACM - only app certs (global us-east-1 for CloudFront + regional)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['acm:*'],
          resources: [
            `arn:aws:acm:${this.region}:${this.account}:certificate/*`,
            `arn:aws:acm:us-east-1:${this.account}:certificate/*` // CloudFront needs us-east-1 certs
          ]
        }),
        // Cognito - only app user pools
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cognito-idp:*'],
          resources: [
            `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`
          ]
        }),
        // CloudWatch Logs - only app log groups
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:*'],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${appName}-${envName}-*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${appName}-${envName}-*:*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:API-Gateway-Execution-Logs_*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:API-Gateway-Execution-Logs_*:*`
          ]
        }),
        // SSM - only app parameters
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:*'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/${envName}/*`
          ]
        }),
        // IAM PassRole - only to allowed services, only app roles
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [
            `arn:aws:iam::${this.account}:role/${appName}-${envName}-*`
          ],
          conditions: {
            StringEquals: {
              'iam:PassedToService': [
                'lambda.amazonaws.com',
                'apigateway.amazonaws.com',
                'cloudformation.amazonaws.com'
              ]
            }
          }
        })
      ]
    });

    // =========================================================
    // EC2 Instance Role for Jenkins (replaces IAM User + keys)
    // Temporary credentials, auto-rotated, nothing stored on disk
    // Only created in dev since it's one EC2 for all envs
    // =========================================================
    let jenkinsInstanceRoleArn: string = `arn:aws:iam::${this.account}:role/${appName}-jenkins-ec2-role`;

    if (envName === 'dev') {
      const jenkinsInstanceRole = new iam.Role(this, 'JenkinsInstanceRole', {
        roleName: `${appName}-jenkins-ec2-role`,
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        description: 'Role attached to Jenkins EC2 instance. Only allows assuming env-specific deploy roles.'
      });

      // Only permission: assume any env's deploy role
      jenkinsInstanceRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/${appName}-*-jenkins-deploy-role`
        ]
      }));

      // Instance profile (required to attach role to EC2)
      const instanceProfile = new iam.CfnInstanceProfile(this, 'JenkinsInstanceProfile', {
        instanceProfileName: `${appName}-jenkins-ec2-profile`,
        roles: [jenkinsInstanceRole.roleName]
      });

      jenkinsInstanceRoleArn = jenkinsInstanceRole.roleArn;
      exportParam('jenkins-ec2-role-name', jenkinsInstanceRole.roleName);
      exportParam('jenkins-ec2-role-arn', jenkinsInstanceRole.roleArn);
      exportParam('jenkins-instance-profile-name', instanceProfile.instanceProfileName!);
    }

    // =========================================================
    // Jenkins Deploy Role (one per env, assumed by EC2 role)
    // Has just enough permissions to run CDK deploys
    // =========================================================
    const jenkinsDeployRole = new iam.Role(this, 'JenkinsDeployRole', {
      roleName: `${appName}-${envName}-jenkins-deploy-role`,
      assumedBy: new iam.ArnPrincipal(jenkinsInstanceRoleArn),
      maxSessionDuration: Duration.hours(2) // CDK deploys can take time
    });

    // CDK bootstrap version check
    // CDK v2 requires this SSM read before every deploy to confirm bootstrap is current
    // us-east-1 also needed for the Edge (CloudFront) stack which deploys there
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CdkBootstrapVersionCheck',
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`,
        `arn:aws:ssm:us-east-1:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`
      ],
    }));

    // Read + write SSM params for this env
    // the API endpoint to SSM after sam deploy
    // us-east-1 edge params (cloudfront-domain, distribution-id)
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
        'ssm:PutParameter'
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/${envName}/*`,
        `arn:aws:ssm:us-east-1:${this.account}:parameter/${appName}/${envName}/*`
      ]
    }));

    // CDK bootstrap S3 bucket access (upload Lambda zips, assets)
    // us-east-1 bootstrap bucket for Edge stack assets
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:PutObject',
        's3:DeleteObject',
        's3:GetBucketLocation',
        's3:GetEncryptionConfiguration'
      ],
      resources: [
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}`,
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`,
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-us-east-1`,
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-us-east-1/*`
      ]
    }));

    // syncs Next.js build output to the frontend bucket
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetObject'
      ],
      resources: [
        `arn:aws:s3:::${appName}-${envName}-*`,
        `arn:aws:s3:::${appName}-${envName}-*/*`
      ]
    }));

    // invalidates the distribution after S3 sync
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudfront:CreateInvalidation'],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/*`
      ]
    }));

    // Pass cfn-execution-role to CloudFormation only.
    // Includes CDK bootstrap cfn-exec role (cdk-hnb659fds-cfn-exec-role-*)
    // which CDK internally uses during every cdk deploy, separate from our
    // custom cfn-execution-role. Both regions needed: ap-south-1 for all stacks,
    // us-east-1 for the Edge (CloudFront) stack.
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/${appName}-${envName}-cfn-execution-role`,
        `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-${this.region}`,
        `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-us-east-1`
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'cloudformation.amazonaws.com'
        }
      }
    }));

    // CloudFormation - scoped to app stacks only
    // us-east-1 for Edge stack (CloudFront)
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
        'cloudformation:DeleteStack',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResources',
        'cloudformation:DescribeStackResource',
        'cloudformation:GetTemplate',
        'cloudformation:ListStacks',
        'cloudformation:ListStackResources',
        'cloudformation:ValidateTemplate',
        'cloudformation:CreateChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:DeleteChangeSet',
        'cloudformation:GetTemplateSummary',
        'cloudformation:ListChangeSets'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${appName}-${envName}-*/*`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/CDKToolkit/*`,
        `arn:aws:cloudformation:us-east-1:${this.account}:stack/${appName}-${envName}-*/*`,
        `arn:aws:cloudformation:us-east-1:${this.account}:stack/CDKToolkit/*`,
        `arn:aws:cloudformation:${this.region}:aws:transform/Serverless-2016-10-31`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/aws-sam-cli-managed-default/*`
      ]
    }));

    // Read CDK bootstrap stack outputs
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:DescribeStacks',
        'cloudformation:GetTemplate'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/CDKToolkit/*`,
        `arn:aws:cloudformation:us-east-1:${this.account}:stack/CDKToolkit/*`
      ]
    }));

    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:CreateBucket',
        's3:GetBucketLocation',
        's3:PutBucketVersioning',
        's3:PutBucketPolicy',
        's3:PutLifecycleConfiguration',
        's3:GetEncryptionConfiguration',
        's3:PutEncryptionConfiguration'
      ],
      resources: [
        `arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*`
      ]
    }));

    // =========================================================
    // CloudFormation Execution Role
    // Assumed BY CloudFormation SERVICE to create actual resources
    // Permission boundary enforces max permissions ceiling
    // =========================================================
    const cfnExecutionRole = new iam.Role(this, 'CfnExecutionRole', {
      roleName: `${appName}-${envName}-cfn-execution-role`,
      assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      permissionsBoundary: permissionBoundary
    });

    // SSM - app params only
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:PutParameter',
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:DeleteParameter',
        'ssm:AddTagsToResource',
        'ssm:ListTagsForResource'
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/${envName}/*`
      ]
    }));

    // S3 - app buckets only
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:*'],
      resources: [
        `arn:aws:s3:::${appName}-${envName}-*`,
        `arn:aws:s3:::${appName}-${envName}-*/*`
      ]
    }));

    // Read CDK assets from bootstrap bucket
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:GetObjectVersion'],
      resources: [
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`
      ]
    }));

    // DynamoDB - app tables only
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:CreateTable',
        'dynamodb:DeleteTable',
        'dynamodb:UpdateTable',
        'dynamodb:DescribeTable',
        'dynamodb:DescribeTimeToLive',
        'dynamodb:UpdateTimeToLive',
        'dynamodb:DescribeContinuousBackups',
        'dynamodb:UpdateContinuousBackups',
        'dynamodb:ListTagsOfResource',
        'dynamodb:TagResource',
        'dynamodb:UntagResource'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*/index/*`
      ]
    }));

    // Lambda - app functions only
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:CreateFunction',
        'lambda:DeleteFunction',
        'lambda:UpdateFunctionCode',
        'lambda:UpdateFunctionConfiguration',
        'lambda:GetFunction',
        'lambda:GetFunctionConfiguration',
        'lambda:ListVersionsByFunction',
        'lambda:PublishVersion',
        'lambda:CreateAlias',
        'lambda:DeleteAlias',
        'lambda:UpdateAlias',
        'lambda:GetAlias',
        'lambda:AddPermission',
        'lambda:RemovePermission',
        'lambda:GetPolicy',
        'lambda:TagResource',
        'lambda:UntagResource',
        'lambda:ListTags',
        'lambda:PutFunctionConcurrency',
        'lambda:DeleteFunctionConcurrency',
        'lambda:PutFunctionEventInvokeConfig',
        'lambda:UpdateFunctionEventInvokeConfig',
        'lambda:DeleteFunctionEventInvokeConfig'
      ],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:${appName}-${envName}-*`,
        `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*`,
        `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*:*`
      ]
    }));

    // API Gateway - account/region scoped
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'apigateway:POST',
        'apigateway:PUT',
        'apigateway:PATCH',
        'apigateway:DELETE',
        'apigateway:GET'
      ],
      resources: [
        `arn:aws:apigateway:${this.region}::/restapis`,
        `arn:aws:apigateway:${this.region}::/restapis/*`,
        `arn:aws:apigateway:${this.region}::/apis`,
        `arn:aws:apigateway:${this.region}::/apis/*`,
        `arn:aws:apigateway:${this.region}::/domainnames`,
        `arn:aws:apigateway:${this.region}::/domainnames/*`,
        `arn:aws:apigateway:${this.region}::/account`
      ]
    }));

    // CloudFront - account scoped
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudfront:CreateDistribution',
        'cloudfront:UpdateDistribution',
        'cloudfront:DeleteDistribution',
        'cloudfront:GetDistribution',
        'cloudfront:GetDistributionConfig',
        'cloudfront:CreateInvalidation',
        'cloudfront:CreateOriginAccessIdentity',
        'cloudfront:DeleteOriginAccessIdentity',
        'cloudfront:GetOriginAccessIdentity',
        'cloudfront:CreateOriginAccessControl',
        'cloudfront:DeleteOriginAccessControl',
        'cloudfront:GetOriginAccessControl',
        'cloudfront:UpdateOriginAccessControl',
        'cloudfront:TagResource',
        'cloudfront:UntagResource',
        'cloudfront:ListTagsForResource'
      ],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/*`,
        `arn:aws:cloudfront::${this.account}:origin-access-identity/*`,
        `arn:aws:cloudfront::${this.account}:origin-access-control/*`
      ]
    }));

    // ACM - certificates
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'acm:RequestCertificate',
        'acm:DeleteCertificate',
        'acm:DescribeCertificate',
        'acm:ListTagsForCertificate',
        'acm:AddTagsToCertificate',
        'acm:RemoveTagsFromCertificate'
      ],
      resources: [
        `arn:aws:acm:${this.region}:${this.account}:certificate/*`,
        `arn:aws:acm:us-east-1:${this.account}:certificate/*`
      ]
    }));

    // Cognito - user pools
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:CreateUserPool',
        'cognito-idp:DeleteUserPool',
        'cognito-idp:UpdateUserPool',
        'cognito-idp:DescribeUserPool',
        'cognito-idp:CreateUserPoolClient',
        'cognito-idp:DeleteUserPoolClient',
        'cognito-idp:UpdateUserPoolClient',
        'cognito-idp:DescribeUserPoolClient',
        'cognito-idp:CreateUserPoolDomain',
        'cognito-idp:DeleteUserPoolDomain',
        'cognito-idp:DescribeUserPoolDomain',
        'cognito-idp:TagResource',
        'cognito-idp:UntagResource',
        'cognito-idp:ListTagsForResource'
      ],
      resources: [
        `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`
      ]
    }));

    // CloudWatch Logs - app log groups only
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:DeleteLogGroup',
        'logs:PutRetentionPolicy',
        'logs:DeleteRetentionPolicy',
        'logs:TagLogGroup',
        'logs:UntagLogGroup',
        'logs:DescribeLogGroups',
        'logs:ListTagsLogGroup',
        'logs:AssociateKmsKey',
        'logs:DisassociateKmsKey'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${appName}-${envName}-*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${appName}-${envName}-*:*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:API-Gateway-Execution-Logs_*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:API-Gateway-Execution-Logs_*:*`
      ]
    }));

    // IAM - only create/manage roles for this app/env
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:UpdateRole',
        'iam:GetRole',
        'iam:AttachRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePolicy',
        'iam:DeleteRolePolicy',
        'iam:GetRolePolicy',
        'iam:TagRole',
        'iam:UntagRole',
        'iam:ListRoleTags',
        'iam:ListAttachedRolePolicies',
        'iam:ListRolePolicies',
        'iam:CreateInstanceProfile',
        'iam:DeleteInstanceProfile',
        'iam:GetInstanceProfile',
        'iam:AddRoleToInstanceProfile',
        'iam:RemoveRoleFromInstanceProfile'
      ],
      resources: [
        `arn:aws:iam::${this.account}:role/${appName}-${envName}-*`,
        `arn:aws:iam::${this.account}:role/${appName}-jenkins-ec2-role`,
        `arn:aws:iam::${this.account}:instance-profile/${appName}-*`
      ]
    }));

    // IAM PassRole - app roles to allowed services only
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/${appName}-${envName}-*`
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': [
            'lambda.amazonaws.com',
            'apigateway.amazonaws.com'
          ]
        }
      }
    }));

    // Add to cfnExecutionRole in iam-stack.ts
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${this.account}:role/${appName}-${envName}-BucketPolicy*`],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'lambda.amazonaws.com' }
      }
    }));

    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudformation:CreateChangeSet'],
      resources: [
        `arn:aws:cloudformation:${this.region}:aws:transform/Serverless-2016-10-31`
      ]
    }));

    exportParam('cfn-execution-role-arn', cfnExecutionRole.roleArn);
    exportParam('jenkins-deploy-role-arn', jenkinsDeployRole.roleArn);
    exportParam('permission-boundary-policy-arn', permissionBoundary.managedPolicyArn);
  }
}