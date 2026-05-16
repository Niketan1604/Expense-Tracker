import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { exportParam } from '../utils/parameter-utils';

interface SplitwiseDataStackProps extends StackProps {
  appName: string;
  envName: string;
  vpc: ec2.Vpc;
  rdsSecurityGroup: ec2.SecurityGroup;
}

export class SplitwiseDataStack extends Stack {

  public readonly dbSecret: secretsmanager.Secret;
  public readonly dbEndpoint: string;

  constructor(scope: Construct, id: string, props: SplitwiseDataStackProps) {
    super(scope, id, props);

    const { appName, envName, vpc, rdsSecurityGroup } = props;
    const domainName = 'splitwise-data';

    // RDS Credentials — Secrets Manager
    this.dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: `/${appName}/${envName}/splitwise/db-credentials`,
      description: 'Splitwise RDS PostgreSQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\'',  // chars that break JDBC connection strings
        passwordLength: 32
      }
    });

    // RDS PostgreSQL Instance
    const instance = new rds.DatabaseInstance(this, 'SplitwiseDb', {
      instanceIdentifier: `${appName}-${envName}-splitwise-db`,

      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16
      }),

      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),

      // ── Credentials ──────────────────────────────────────────
      // Tells RDS to use the username from our secret and the
      // generated password. CDK wires these together automatically.
      credentials: rds.Credentials.fromSecret(this.dbSecret),

      // ── Network ──────────────────────────────────────────────
      vpc,
      vpcSubnets: {
        // Private isolated subnet — no internet route in or out.
        // Only reachable from ECS tasks via the rdsSecurityGroup rule.
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [rdsSecurityGroup],
      publiclyAccessible: false,

      // ── Database ─────────────────────────────────────────────
      databaseName: 'splitwise',

      // ── Storage ──────────────────────────────────────────────
      allocatedStorage: 20,                // GB — free tier maximum
      storageType: rds.StorageType.GP2,
      storageEncrypted: true,              // encrypt at rest, no extra cost

      // ── Availability ─────────────────────────────────────────
      multiAz: false,                      // single AZ, matches network stack

      // ── Backups ──────────────────────────────────────────────
      backupRetention: Duration.days(7),
      deleteAutomatedBackups: true,        // clean up backups if instance is deleted

      // ── Maintenance ──────────────────────────────────────────
      // 03:00–04:00 UTC on Sunday — low-traffic window.
      // AWS applies minor version patches and maintenance here.
      preferredMaintenanceWindow: 'Sun:03:00-Sun:04:00',

      // ── Lifecycle ────────────────────────────────────────────
      removalPolicy: RemovalPolicy.RETAIN, // CloudFormation will NOT delete this instance
      // even on cdk destroy — manual deletion required

      // ── Logging ──────────────────────────────────────────────
      // Send PostgreSQL logs to CloudWatch so you can query slow
      // queries and errors without SSHing anywhere.
      // uncomment when needed
      // cloudwatchLogsExports: ['postgresql'],  
      // cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,

      // ── Performance Insights ─────────────────────────────────
      // Free tier: 7-day retention. Useful for identifying slow
      // queries during development without any extra cost.
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT  // 7 days free
    });

    this.dbEndpoint = instance.instanceEndpoint.hostname;

    exportParam(this, appName, envName, domainName, 'db-endpoint', instance.instanceEndpoint.hostname);
    exportParam(this, appName, envName, domainName, 'db-port', instance.instanceEndpoint.port.toString());
    exportParam(this, appName, envName, domainName, 'db-name', 'splitwise');
    exportParam(this, appName, envName, domainName, 'db-secret-arn', this.dbSecret.secretArn);
    exportParam(this, appName, envName, domainName, 'db-instance-id', instance.instanceIdentifier);
  }
}
