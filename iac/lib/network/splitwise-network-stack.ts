import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { exportParam } from '../utils/parameter-utils';

interface SplitwiseNetworkStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class SplitwiseNetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly vpcLinkSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SplitwiseNetworkStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;
    const domainName = 'splitwise-network';

    // =========================================================
    // VPC — single AZ, zero extra network cost.
    //
    // Why no NAT Gateway and no VPC Endpoints:
    //   Both approaches cost money for idle infrastructure.
    //   NAT Gateway = ~$32/month. VPC Interface Endpoints = ~$29/month.
    //   Neither is justified for a dev/learning project.
    //
    // The solution: ECS tasks run in the PUBLIC subnet with a public IP.
    //   They use that public IP to reach ECR, Secrets Manager, and
    //   CloudWatch directly. This costs $0 in networking.
    //
    // What each subnet is used for:
    //   Public subnet  → API Gateway VPC Link + ECS tasks
    //   Private subnet → RDS only (genuinely no internet route needed)
    //
    // natGateways: 0 — no NAT, ECS uses its public IP for outbound.
    // maxAzs: 1      — single AZ, no redundancy overhead.
    // =========================================================
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${appName}-${envName}-splitwise-vpc`,

      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/22'),

      maxAzs: 2,        // RDS requires DB subnet group across >=2 AZs even for single-AZ instances
      natGateways: 0,

      subnetConfiguration: [
        // ── Public subnet ───────────────────────────────────────
        // API Gateway VPC Link + ECS tasks live here.
        // ECS tasks use their auto-assigned public IP for outbound
        // calls to ECR, Secrets Manager, CloudWatch.
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: false  // ECS assigns public IPs per-task via assignPublicIp setting
        },

        // ── Private ISOLATED subnet ─────────────────────────────
        // RDS ONLY. No internet route in or out.
        // Reachable only from ECS tasks in the same VPC
        // via the private ECS → RDS security group rule.
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }
      ],

      enableDnsHostnames: true,  // required for RDS endpoint DNS resolution
      enableDnsSupport: true
    });

    // =========================================================
    // VPC Link Security Group (API Gateway)
    // =========================================================
    this.vpcLinkSecurityGroup = new ec2.SecurityGroup(this, 'VpcLinkSecurityGroup', {
      securityGroupName: `${appName}-${envName}-splitwise-vpclink-sg`,
      vpc: this.vpc,
      description: 'Splitwise VPC Link - allows API Gateway to route to ECS',
      allowAllOutbound: true
    });

    this.vpcLinkSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow HTTP from API Gateway into VPC Link ENI'
    );

    // =========================================================
    // ECS Security Group
    //
    // ECS tasks sit in the PUBLIC subnet alongside the ALB.
    // Despite having a public IP, this SG ensures the only
    // inbound traffic accepted is from the ALB on port 8080.
    //
    // Why source = albSecurityGroup and not a CIDR:
    //   Using the SG reference means only resources attached to
    //   the ALB SG can reach ECS — not any other resource in the
    //   public subnet, and not anything from the internet.
    //
    // allowAllOutbound: true — ECS needs to reach:
    //   - RDS (port 5432) in the private subnet
    //   - ECR (HTTPS) to pull Docker images at task start
    //   - Secrets Manager (HTTPS) to fetch DB credentials
    //   - CloudWatch Logs (HTTPS) to ship container logs
    //   All three are reached via the task's public IP — no cost.
    // =========================================================
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      securityGroupName: `${appName}-${envName}-splitwise-ecs-sg`,
      vpc: this.vpc,
      description: 'Splitwise ECS tasks - accepts traffic only from VPC Link on 8080',
      allowAllOutbound: true
    });

    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.vpcLinkSecurityGroup.securityGroupId),
      ec2.Port.tcp(8080),
      'Allow inbound from VPC Link on Spring Boot port 8080'
    );

    // =========================================================
    // RDS Security Group
    // Allows inbound 5432 ONLY from ECS tasks.
    // RDS never initiates connections so outbound is disabled.
    // =========================================================
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      securityGroupName: `${appName}-${envName}-splitwise-rds-sg`,
      vpc: this.vpc,
      description: 'Splitwise RDS - accepts PostgreSQL only from ECS tasks',
      allowAllOutbound: false
    });

    this.rdsSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.ecsSecurityGroup.securityGroupId),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from ECS tasks only'
    );

    // =========================================================
    // SSM Exports
    // Convention: /{appName}/{envName}/splitwise/network/{key}
    // =========================================================
    exportParam(this, appName, envName, domainName, 'vpc-id', this.vpc.vpcId);
    
    // Export subnets individually because CloudFormation !Split cannot process dynamic {{resolve:ssm}} references
    this.vpc.publicSubnets.forEach((subnet, index) => {
      exportParam(this, appName, envName, domainName, `public-subnet-${index + 1}-id`, subnet.subnetId);
    });
    
    this.vpc.isolatedSubnets.forEach((subnet, index) => {
      exportParam(this, appName, envName, domainName, `private-subnet-${index + 1}-id`, subnet.subnetId);
    });
    exportParam(this, appName, envName, domainName, 'vpclink-sg-id', this.vpcLinkSecurityGroup.securityGroupId);
    exportParam(this, appName, envName, domainName, 'ecs-sg-id', this.ecsSecurityGroup.securityGroupId);
    exportParam(this, appName, envName, domainName, 'rds-sg-id', this.rdsSecurityGroup.securityGroupId);
  }
}
