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
  public readonly albSecurityGroup: ec2.SecurityGroup;
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
    //   CloudWatch directly — the same way your laptop does.
    //   This costs $0 in networking.
    //
    // "Is this insecure?"
    //   No. Security groups are what actually enforce access control,
    //   not subnet placement. The ECS security group allows inbound
    //   ONLY from the ALB on port 8080. No one on the internet can
    //   initiate a connection to an ECS task. The public IP is used
    //   exclusively for ECS outbound calls to AWS services (ECR, etc.).
    //
    // What each subnet is used for:
    //   Public subnet  → ALB + ECS tasks
    //   Private subnet → RDS only (genuinely no internet route needed)
    //
    // natGateways: 0 — no NAT, ECS uses its public IP for outbound.
    // maxAzs: 1      — single AZ, no redundancy overhead.
    // =========================================================
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${appName}-${envName}-splitwise-vpc`,

      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/22'),

      maxAzs: 1,
      natGateways: 0,

      subnetConfiguration: [
        // ── Public subnet ───────────────────────────────────────
        // ALB + ECS tasks both live here.
        // Internet Gateway routes inbound traffic to the ALB.
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
    // ALB Security Group
    //
    // Why anyIpv4 and not "API Gateway only":
    //   API Gateway does not have fixed IP addresses — it uses a
    //   large dynamic pool managed by AWS. There is no managed
    //   prefix list for API Gateway (unlike CloudFront). So it is
    //   not possible to whitelist "only API Gateway" at SG level.
    //
    // ⚠️  Known gap: anyone with the ALB URL can bypass API Gateway.
    //   The ECS SG does NOT help here — it allows traffic that came
    //   via the ALB regardless of whether it originated from API
    //   Gateway or directly. JWT validation lives in API Gateway,
    //   not Spring Boot, so direct ALB access is unauthenticated.
    //
    // Chosen mitigation — Secret Header (free):
    //   API Gateway injects a secret header (X-Internal-Token)
    //   on every forwarded request. The ALB listener rule (defined
    //   in the runtime stack) returns 403 for any request that
    //   does not carry this header. This closes the gap without
    //   needing VPC Link.
    //   Secret value lives in Secrets Manager, injected into both
    //   API Gateway and the ALB listener rule via CDK at deploy time.
    //
    // Proper network-level alternative (not used — costs money):
    //   VPC Link: API Gateway → VPC Link → internal ALB.
    //   ALB becomes unreachable from internet entirely.
    //   Cost: ~$25/month.
    //
    // allowAllOutbound: true — ALB forwards to ECS on port 8080.
    // =========================================================
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      securityGroupName: `${appName}-${envName}-splitwise-alb-sg`,
      vpc: this.vpc,
      description: 'Splitwise ALB — allows inbound HTTP from API Gateway of Flowmint',
      allowAllOutbound: true
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from API Gateway of Flowmint to ALB with security header'
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
      description: 'Splitwise ECS tasks — accepts traffic only from ALB on 8080',
      allowAllOutbound: true
    });

    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.albSecurityGroup.securityGroupId),
      ec2.Port.tcp(8080),
      'Allow inbound from ALB on Spring Boot port 8080'
    );

    // =========================================================
    // RDS Security Group
    // Allows inbound 5432 ONLY from ECS tasks.
    // RDS never initiates connections so outbound is disabled.
    // =========================================================
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      securityGroupName: `${appName}-${envName}-splitwise-rds-sg`,
      vpc: this.vpc,
      description: 'Splitwise RDS — accepts PostgreSQL only from ECS tasks',
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
    exportParam(this, appName, envName, domainName, 'public-subnet-ids', this.vpc.publicSubnets.map(s => s.subnetId).join(','));
    exportParam(this, appName, envName, domainName, 'private-subnet-ids', this.vpc.isolatedSubnets.map(s => s.subnetId).join(','));
    exportParam(this, appName, envName, domainName, 'alb-sg-id', this.albSecurityGroup.securityGroupId);
    exportParam(this, appName, envName, domainName, 'ecs-sg-id', this.ecsSecurityGroup.securityGroupId);
    exportParam(this, appName, envName, domainName, 'rds-sg-id', this.rdsSecurityGroup.securityGroupId);
  }
}
