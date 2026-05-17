import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudmap from 'aws-cdk-lib/aws-servicediscovery';
import { exportParam } from '../utils/parameter-utils';

interface SplitwiseClusterStackProps extends StackProps {
  appName: string;
  envName: string;
  vpc: ec2.Vpc;
}

export class SplitwiseClusterStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: SplitwiseClusterStackProps) {
    super(scope, id, props);

    const { appName, envName, vpc } = props;
    const domainName = 'splitwise-compute';

    // =========================================================
    // CloudWatch Log Group
    // =========================================================
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/ecs/${appName}-${envName}-splitwise`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // =========================================================
    // ECS Cluster
    // =========================================================
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${appName}-${envName}-splitwise-cluster`,
      vpc,
      defaultCloudMapNamespace: {
        name: 'splitwise.local',
        type: cloudmap.NamespaceType.HTTP
      }
    });

    exportParam(this, appName, envName, domainName, 'cluster-name', this.cluster.clusterName);
    exportParam(this, appName, envName, domainName, 'log-group-name', this.logGroup.logGroupName);
  }
}
