import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { exportParam } from '../utils/parameter-utils';

interface SplitwiseEcsRolesStackProps extends StackProps {
  appName: string;
  envName: string;
  repositoryArn: string;
  dbSecretArn: string;
}

export class SplitwiseEcsRolesStack extends Stack {
  public readonly taskExecutionRole: iam.Role;
  public readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props: SplitwiseEcsRolesStackProps) {
    super(scope, id, props);

    const { appName, envName, repositoryArn, dbSecretArn } = props;
    const domainName = 'splitwise-iam';

    // ECS Task Execution Role
    this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${appName}-${envName}-splitwise-ecs-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS agent role - pulls ECR image, injects secrets, writes logs'
    });

    // ECR: pull the Spring Boot Docker image
    this.taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrGetAuthToken',
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*']   // AWS requires * for this action — cannot be scoped
    }));

    this.taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPullImage',
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: [repositoryArn]
    }));

    // ── Secrets Manager: read DB credentials ──────────────────
    this.taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ReadDbSecret',
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [dbSecretArn]
    }));

    // ── CloudWatch Logs: write container logs ─────────────────
    this.taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogs',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/ecs/${appName}-${envName}-splitwise`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/ecs/${appName}-${envName}-splitwise:*`
      ]
    }));

    // ECS Task Role - this role is assumed by the task that is been running
    // and it is used to give permission to the application running inside the task to access resources like s3
    this.taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${appName}-${envName}-splitwise-ecs-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Application role - assumed by Spring Boot code inside the container'
    });

    // SSM Exports
    exportParam(this, appName, envName, domainName, 'execution-role-arn', this.taskExecutionRole.roleArn);
    exportParam(this, appName, envName, domainName, 'task-role-arn', this.taskRole.roleArn);
  }
}
