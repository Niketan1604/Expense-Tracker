import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { exportParam } from '../utils/parameter-utils';

interface IamStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class FlowmintIamStack extends Stack {

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;
    const domainName = 'iam';

    // =========================================================
    // Permission Boundary
    //
    // Hard ceiling on cfn-execution-role.
    // Must include EVERY action cfn-execution-role will ever do.
    // Both the role policy AND boundary must allow an action —
    // if either denies it, the action is denied.
    // =========================================================
    const permissionBoundary = new iam.ManagedPolicy(this, 'PermissionBoundary', {
      managedPolicyName: `${appName}-${envName}-permission-boundary`,
      statements: [

        // CloudFormation — SAM transform expansion
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cloudformation:CreateChangeSet',
            'cloudformation:DescribeChangeSet',
            'cloudformation:ExecuteChangeSet',
            'cloudformation:DescribeStacks',
            'cloudformation:GetTemplateSummary'
          ],
          resources: [
            `arn:aws:cloudformation:${this.region}:aws:transform/Serverless-2016-10-31`,
            `arn:aws:cloudformation:${this.region}:${this.account}:stack/${appName}-${envName}-*/*`
          ]
        }),

        // S3 — app buckets + CDK bootstrap bucket + SAM artifact bucket
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:*'],
          resources: [
            `arn:aws:s3:::${appName}-${envName}-*`,
            `arn:aws:s3:::${appName}-${envName}-*/*`,
            `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}`,
            `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`,
            `arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*`,
            `arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*/*`
          ]
        }),

        // DynamoDB — app tables only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:*'],
          resources: [
            `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*`,
            `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*/index/*`,
            `arn:aws:dynamodb:${this.region}:${this.account}:table/${appName}-${envName}-*/stream/*`
          ]
        }),

        // Lambda — app functions only
        // Using lambda:* to avoid enumerating SAM-internal actions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:*'],
          resources: [
            `arn:aws:lambda:${this.region}:${this.account}:function:${appName}-${envName}-*`,
            `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*`,
            `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*:*`
          ]
        }),

        // API Gateway — wildcard covers all v2 sub-resources:
        // /apis, /apis/*, /apis/*/stages/*, /apis/*/routes/*,
        // /apis/*/integrations/*, /apis/*/authorizers/*, /tags/*
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['apigateway:*'],
          resources: [
            `arn:aws:apigateway:${this.region}::*`
          ]
        }),

        // CloudFront — distributions + OAC
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

        // ACM — certificates (regional + us-east-1 for CloudFront)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['acm:*'],
          resources: [
            `arn:aws:acm:${this.region}:${this.account}:certificate/*`,
            `arn:aws:acm:us-east-1:${this.account}:certificate/*`
          ]
        }),

        // Cognito — user pools
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cognito-idp:*'],
          resources: [
            `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`
          ]
        }),

        // CloudWatch Logs — app log groups only
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

        // SSM — app parameters only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:*'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/${envName}/*`
          ]
        }),

        // IAM — create/manage app roles + pass them to allowed services
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:*'],
          resources: [
            `arn:aws:iam::${this.account}:role/${appName}-${envName}-*`,
            `arn:aws:iam::${this.account}:role/${appName}-jenkins-ec2-role`,
            `arn:aws:iam::${this.account}:instance-profile/${appName}-*`,
            `arn:aws:iam::${this.account}:policy/${appName}-${envName}-*`
          ]
        }),

        // IAM — create service-linked roles (ECS, RDS, EC2 require these)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:CreateServiceLinkedRole'],
          resources: [
            `arn:aws:iam::${this.account}:role/aws-service-role/ecs.amazonaws.com/*`,
            `arn:aws:iam::${this.account}:role/aws-service-role/rds.amazonaws.com/*`,
            `arn:aws:iam::${this.account}:role/aws-service-role/elasticloadbalancing.amazonaws.com/*`,
            `arn:aws:iam::${this.account}:role/aws-service-role/apigateway.amazonaws.com/*`,
            `arn:aws:iam::${this.account}:role/aws-service-role/ops.apigateway.amazonaws.com/*`
          ]
        }),

        // EC2 / VPC — VPC, subnets, security groups, routing (Splitwise network)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ec2:*'],
          resources: ['*']
        }),

        // RDS — PostgreSQL instance + subnet groups + parameter groups
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['rds:*'],
          resources: [
            `arn:aws:rds:${this.region}:${this.account}:db:${appName}-${envName}-*`,
            `arn:aws:rds:${this.region}:${this.account}:subgrp:*`,
            `arn:aws:rds:${this.region}:${this.account}:pg:*`,
            `arn:aws:rds:${this.region}:${this.account}:secgrp:*`
          ]
        }),

        // Secrets Manager — DB credentials secret
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:*'],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/${appName}/${envName}/*`
          ]
        }),

        // ECR — container image repository (Splitwise)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ecr:*'],
          resources: [
            `arn:aws:ecr:${this.region}:${this.account}:repository/${appName}-${envName}-*`
          ]
        }),

        // ECR — auth token (must be * per AWS requirement)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ecr:GetAuthorizationToken'],
          resources: ['*']
        }),

        // ECS — Fargate cluster, service, task definition (Splitwise)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ecs:*'],
          resources: ['*']
        }),

        // Service Discovery (CloudMap) — private DNS namespace for ECS
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['servicediscovery:*', 'route53:*'],
          resources: ['*']
        })
      ]
    });

    // =========================================================
    // EC2 Instance Role for Jenkins
    // Only permission: assume any env-specific deploy role
    // =========================================================
    let jenkinsInstanceRoleArn: string = `arn:aws:iam::${this.account}:role/${appName}-jenkins-ec2-role`;

    if (envName === 'dev') {
      const jenkinsInstanceRole = new iam.Role(this, 'JenkinsInstanceRole', {
        roleName: `${appName}-jenkins-ec2-role`,
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        description: 'Attached to Jenkins EC2. Only allows assuming env-specific deploy roles.'
      });

      jenkinsInstanceRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/${appName}-*-jenkins-deploy-role`
        ]
      }));

      const instanceProfile = new iam.CfnInstanceProfile(this, 'JenkinsInstanceProfile', {
        instanceProfileName: `${appName}-jenkins-ec2-profile`,
        roles: [jenkinsInstanceRole.roleName]
      });

      jenkinsInstanceRoleArn = jenkinsInstanceRole.roleArn;
      exportParam(this, appName, envName, domainName, 'jenkins-ec2-role-name', jenkinsInstanceRole.roleName);
      exportParam(this, appName, envName, domainName, 'jenkins-ec2-role-arn', jenkinsInstanceRole.roleArn);
      exportParam(this, appName, envName, domainName, 'jenkins-instance-profile-name', instanceProfile.instanceProfileName!);
    }

    // =========================================================
    // Jenkins Deploy Role
    //
    // ONLY orchestration permissions — Jenkins calls AWS APIs
    // to trigger deployments. Actual resource creation is done
    // by cfn-execution-role, not jenkins-deploy-role.
    // =========================================================
    const jenkinsDeployRole = new iam.Role(this, 'JenkinsDeployRole', {
      roleName: `${appName}-${envName}-jenkins-deploy-role`,
      assumedBy: new iam.ArnPrincipal(jenkinsInstanceRoleArn),
      maxSessionDuration: Duration.hours(2)
    });

    // CDK bootstrap version check (both regions)
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`,
        `arn:aws:ssm:us-east-1:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`
      ]
    }));

    // App SSM params — read for pipeline config (both regions for edge params)
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath'
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/${envName}/*`,
        `arn:aws:ssm:us-east-1:${this.account}:parameter/${appName}/${envName}/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/cognito/google-client-id`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/${appName}/cognito/google-client-secret`
      ]
    }));

    // CDK bootstrap S3 buckets (both regions)
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
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

    // SAM artifact bucket — Jenkins uploads Lambda zips here before sam deploy
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:CreateBucket',
        's3:GetBucketLocation',
        's3:GetBucketPolicy',
        's3:PutBucketVersioning',
        's3:PutBucketPolicy',
        's3:PutLifecycleConfiguration',
        's3:GetEncryptionConfiguration',
        's3:PutEncryptionConfiguration',
        's3:PutBucketTagging',
        's3:TagResource',
        's3:GetBucketAcl',
        's3:PutBucketPublicAccessBlock',
        's3:GetBucketPublicAccessBlock',
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
      resources: [
        `arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*`,
        `arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*/*`
      ]
    }));

    // Frontend S3 bucket — Jenkins syncs Next.js build output directly
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

    // CloudFront invalidation — Jenkins triggers after frontend S3 sync
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudfront:CreateInvalidation',
        'cloudfront:ListDistributions',
        'cloudfront:GetDistribution'
      ],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/*`
      ]
    }));

    // ECR — Jenkins pushes Docker images before CDK deploys ECS task
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*']
    }));

    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:PutImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:DescribeRepositories',
        'ecr:DescribeImages',
        'ecr:ListImages'
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/${appName}-${envName}-*`
      ]
    }));

    // ECS — Jenkins may trigger forced deployments / describe services
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:DescribeServices',
        'ecs:DescribeClusters',
        'ecs:DescribeTaskDefinition',
        'ecs:ListServices',
        'ecs:ListTaskDefinitions',
        'ecs:UpdateService'
      ],
      resources: ['*']
    }));

    // EC2 — CDK needs describe calls during synth/diff for VPC context lookups
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:DescribeAvailabilityZones',
        'ec2:DescribeVpcs',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeRouteTables',
        'ec2:DescribeInternetGateways',
        'ec2:DescribeVpcAttribute'
      ],
      resources: ['*']
    }));

    // RDS — Jenkins pipeline needs to start/stop DB instances to save costs
    jenkinsDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds:StartDBInstance',
        'rds:StopDBInstance',
        'rds:DescribeDBInstances'
      ],
      resources: [
        `arn:aws:rds:${this.region}:${this.account}:db:${appName}-${envName}-*`
      ]
    }));

    // CloudFormation — Jenkins creates/updates stacks and monitors progress
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
        'cloudformation:DescribeEvents',           // required by CDK for changeset failure details
        'cloudformation:GetTemplate',
        'cloudformation:GetTemplateSummary',
        'cloudformation:ListStacks',
        'cloudformation:ListStackResources',
        'cloudformation:ValidateTemplate',
        'cloudformation:CreateChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:DeleteChangeSet',
        'cloudformation:ListChangeSets'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${appName}-${envName}-*/*`,
        `arn:aws:cloudformation:us-east-1:${this.account}:stack/${appName}-${envName}-*/*`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/CDKToolkit/*`,
        `arn:aws:cloudformation:us-east-1:${this.account}:stack/CDKToolkit/*`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/aws-sam-cli-managed-default/*`,
        `arn:aws:cloudformation:${this.region}:aws:transform/Serverless-2016-10-31`
      ]
    }));

    // IAM PassRole — Jenkins passes cfn-execution-role to CloudFormation
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

    // =========================================================
    // CloudFormation Execution Role
    //
    // Assumed BY CloudFormation to create actual AWS resources.
    // Permission boundary enforces the hard ceiling.
    // =========================================================
    const cfnExecutionRole = new iam.Role(this, 'CfnExecutionRole', {
      roleName: `${appName}-${envName}-cfn-execution-role`,
      assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      permissionsBoundary: permissionBoundary
    });

    // CloudFormation — SAM transform expansion
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:CreateChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:DescribeStacks',
        'cloudformation:GetTemplateSummary'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:aws:transform/Serverless-2016-10-31`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${appName}-${envName}-*/*`
      ]
    }));

    // S3 — app buckets + CDK bootstrap reads + SAM artifact bucket reads
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:*'],
      resources: [
        `arn:aws:s3:::${appName}-${envName}-*`,
        `arn:aws:s3:::${appName}-${envName}-*/*`
      ]
    }));

    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:GetObjectVersion'],
      resources: [
        // CDK bootstrap bucket
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`,
        // SAM artifact bucket — CloudFormation reads Lambda zips from here
        `arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*/*`
      ]
    }));

    // DynamoDB — app tables only
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

    // Lambda — using lambda:* to cover all SAM-internal actions
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:*'],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:${appName}-${envName}-*`,
        `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*`,
        `arn:aws:lambda:${this.region}:${this.account}:layer:${appName}-${envName}-*:*`
      ]
    }));

    // API Gateway v2 — wildcard covers all sub-resources:
    // /apis, /apis/*, /apis/*/stages/*, /apis/*/routes/*,
    // /apis/*/integrations/*, /apis/*/authorizers/*, /tags/*
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['apigateway:*'],
      resources: [
        `arn:aws:apigateway:${this.region}::*`
      ]
    }));

    // CloudFront — distributions + OAC
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudfront:CreateDistribution',
        'cloudfront:UpdateDistribution',
        'cloudfront:DeleteDistribution',
        'cloudfront:GetDistribution',
        'cloudfront:GetDistributionConfig',
        'cloudfront:CreateInvalidation',
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
        `arn:aws:cloudfront::${this.account}:origin-access-control/*`
      ]
    }));

    // ACM — certificates
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

    // Cognito — user pools + clients + domains
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

    // CloudWatch Logs — Lambda + API Gateway log groups
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
        'logs:ListTagsLogGroup'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${appName}-${envName}-*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${appName}-${envName}-*:*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:API-Gateway-Execution-Logs_*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:API-Gateway-Execution-Logs_*:*`
      ]
    }));

    // SSM — app params only
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

    // IAM — create/manage app roles (LambdaExecutionRole, ECS task roles etc.)
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:UpdateRole',
        'iam:GetRole',
        'iam:GetRolePolicy',
        'iam:AttachRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePolicy',
        'iam:DeleteRolePolicy',
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

    // IAM — create service-linked roles required by ECS, RDS, ELB, and API Gateway
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:CreateServiceLinkedRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/aws-service-role/ecs.amazonaws.com/*`,
        `arn:aws:iam::${this.account}:role/aws-service-role/rds.amazonaws.com/*`,
        `arn:aws:iam::${this.account}:role/aws-service-role/elasticloadbalancing.amazonaws.com/*`,
        `arn:aws:iam::${this.account}:role/aws-service-role/apigateway.amazonaws.com/*`,
        `arn:aws:iam::${this.account}:role/aws-service-role/ops.apigateway.amazonaws.com/*`
      ]
    }));

    // IAM PassRole — pass app roles to Lambda, API Gateway, and ECS
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
            'apigateway.amazonaws.com',
            'ecs-tasks.amazonaws.com'
          ]
        }
      }
    }));

    // EC2 / VPC — VPC, subnets, security groups, routing, internet gateway
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ec2:*'],
      resources: ['*']
    }));

    // RDS — PostgreSQL instance, subnet group, parameter group
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds:CreateDBInstance',
        'rds:DeleteDBInstance',
        'rds:ModifyDBInstance',
        'rds:DescribeDBInstances',
        'rds:CreateDBSubnetGroup',
        'rds:DeleteDBSubnetGroup',
        'rds:ModifyDBSubnetGroup',
        'rds:DescribeDBSubnetGroups',
        'rds:CreateDBParameterGroup',
        'rds:DeleteDBParameterGroup',
        'rds:ModifyDBParameterGroup',
        'rds:DescribeDBParameterGroups',
        'rds:DescribeDBParameters',
        'rds:AddTagsToResource',
        'rds:RemoveTagsFromResource',
        'rds:ListTagsForResource',
        'rds:DescribeDBEngineVersions',
        'rds:DescribeOrderableDBInstanceOptions'
      ],
      resources: [
        `arn:aws:rds:${this.region}:${this.account}:db:${appName}-${envName}-*`,
        `arn:aws:rds:${this.region}:${this.account}:subgrp:*`,
        `arn:aws:rds:${this.region}:${this.account}:pg:*`,
        `arn:aws:rds:${this.region}:${this.account}:secgrp:*`,
        `arn:aws:rds:${this.region}:${this.account}:*`
      ]
    }));

    // Secrets Manager — DB credentials secret created by data stack
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:DeleteSecret',
        'secretsmanager:UpdateSecret',
        'secretsmanager:DescribeSecret',
        'secretsmanager:GetSecretValue',
        'secretsmanager:PutSecretValue',
        'secretsmanager:TagResource',
        'secretsmanager:UntagResource',
        'secretsmanager:ListSecretVersionIds',
        'secretsmanager:RotateSecret',
        'secretsmanager:CancelRotateSecret'
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/${appName}/${envName}/*`
      ]
    }));

    // ECR — container registry (create repo, lifecycle rules)
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:CreateRepository',
        'ecr:DeleteRepository',
        'ecr:DescribeRepositories',
        'ecr:PutLifecyclePolicy',
        'ecr:DeleteLifecyclePolicy',
        'ecr:GetLifecyclePolicy',
        'ecr:PutImageScanningConfiguration',
        'ecr:PutImageTagMutability',
        'ecr:SetRepositoryPolicy',
        'ecr:DeleteRepositoryPolicy',
        'ecr:TagResource',
        'ecr:UntagResource',
        'ecr:ListTagsForResource'
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/${appName}-${envName}-*`
      ]
    }));

    // ECR — auth token (must be * per AWS requirement)
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*']
    }));

    // ECS — Fargate cluster, task definition, service, CloudMap integration
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:CreateCluster',
        'ecs:DeleteCluster',
        'ecs:DescribeClusters',
        'ecs:PutClusterCapacityProviders',
        'ecs:RegisterTaskDefinition',
        'ecs:DeregisterTaskDefinition',
        'ecs:DescribeTaskDefinition',
        'ecs:CreateService',
        'ecs:DeleteService',
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:TagResource',
        'ecs:UntagResource',
        'ecs:ListTagsForResource'
      ],
      resources: ['*']
    }));

    // Service Discovery (CloudMap) — private DNS namespace for ECS
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'servicediscovery:CreatePrivateDnsNamespace',
        'servicediscovery:DeleteNamespace',
        'servicediscovery:GetNamespace',
        'servicediscovery:ListNamespaces',
        'servicediscovery:CreateService',
        'servicediscovery:DeleteService',
        'servicediscovery:GetService',
        'servicediscovery:UpdateService',
        'servicediscovery:ListServices',
        'servicediscovery:TagResource',
        'servicediscovery:UntagResource',
        'servicediscovery:GetOperation',
        'servicediscovery:ListOperations'
      ],
      resources: ['*']
    }));

    // Route 53 — CloudMap creates hosted zones for private DNS namespaces
    cfnExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'route53:CreateHostedZone',
        'route53:DeleteHostedZone',
        'route53:GetHostedZone',
        'route53:ListHostedZones',
        'route53:ChangeResourceRecordSets',
        'route53:GetChange',
        'route53:AssociateVPCWithHostedZone',
        'route53:DisassociateVPCFromHostedZone'
      ],
      resources: ['*']
    }));

    exportParam(this, appName, envName, domainName, 'cfn-execution-role-arn', cfnExecutionRole.roleArn);
    exportParam(this, appName, envName, domainName, 'jenkins-deploy-role-arn', jenkinsDeployRole.roleArn);
    exportParam(this, appName, envName, domainName, 'permission-boundary-policy-arn', permissionBoundary.managedPolicyArn);
  }
}