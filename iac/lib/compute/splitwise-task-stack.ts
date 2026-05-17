import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { exportParam } from '../utils/parameter-utils';

interface SplitwiseTaskStackProps extends StackProps {
  appName: string;
  envName: string;
  ecsSecurityGroup: ec2.SecurityGroup;
  repositoryUri: string;
  taskExecutionRole: iam.Role;
  taskRole: iam.Role;
  dbEndpoint: string;
  dbSecretArn: string;
  cluster: ecs.Cluster;
  logGroup: logs.LogGroup;
}

export class SplitwiseTaskStack extends Stack {

  constructor(scope: Construct, id: string, props: SplitwiseTaskStackProps) {
    super(scope, id, props);

    const {
      appName, envName,
      ecsSecurityGroup, repositoryUri,
      taskExecutionRole, taskRole,
      dbEndpoint, dbSecretArn,
      cluster, logGroup
    } = props;

    const domainName = 'splitwise-compute';

    // =========================================================
    // ECS Task Definition
    // =========================================================
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${appName}-${envName}-splitwise`,
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: taskExecutionRole,
      taskRole
    });

    // =========================================================
    // Container Definition
    // =========================================================
    taskDefinition.addContainer('SpringBootContainer', {
      containerName: `${appName}-${envName}-splitwise`,
      image: ecs.ContainerImage.fromRegistry(`${repositoryUri}:latest`),

      environment: {
        SPRING_PROFILES_ACTIVE: envName,
        DB_ENDPOINT: dbEndpoint,
        DB_PORT: '5432',
        DB_NAME: 'splitwise',
        SPRING_DATASOURCE_URL: `jdbc:postgresql://${dbEndpoint}:5432/splitwise`,
        SERVER_PORT: '8080'
      },

      secrets: (() => {
        const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(
          this, 'ImportedDbSecret', dbSecretArn
        );
        return {
          DB_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password')
        };
      })(),

      portMappings: [{
        containerPort: 8080,
        protocol: ecs.Protocol.TCP
      }],

      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/health || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(60)
      },

      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ecs',
        logGroup
      })
    });

    // =========================================================
    // ECS Fargate Service
    // =========================================================
    const service = new ecs.FargateService(this, 'FargateService', {
      serviceName: `${appName}-${envName}-splitwise`,
      cluster,
      taskDefinition,
      // desiredCount: 0 — no tasks run at infrastructure deploy time.
      // The ECR repo is empty at this point (no image pushed yet).
      // A separate build pipeline pushes the Spring Boot image and then
      // updates the service to desiredCount: 1 via `aws ecs update-service`.
      desiredCount: 0,

      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true,
      securityGroups: [ecsSecurityGroup],

      deploymentController: {
        type: ecs.DeploymentControllerType.ECS
      },

      // Circuit breaker disabled during initial infra deploy —
      // with desiredCount: 0 it never fires, but keeping it off
      // prevents accidental rollbacks on first image push too.
      circuitBreaker: {
        rollback: false // TODO: set this to true once spring boot application is setup
      },

      minHealthyPercent: 0,
      maxHealthyPercent: 100,

      cloudMapOptions: {
        name: 'backend'
      }
    });

    exportParam(this, appName, envName, domainName, 'service-name', service.serviceName);
    if (service.cloudMapService) {
      exportParam(this, appName, envName, domainName, 'cloudmap-service-arn', service.cloudMapService.serviceArn);
    }
  }
}
