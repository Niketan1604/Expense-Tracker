import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { exportParam } from '../utils/parameter-utils';

interface FrontendStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class FlowmintFrontendStack extends Stack {
  // Exposed so edge stack can reference the bucket directly
  public readonly bucket: s3.Bucket;
  public readonly bucketName: string;
  public readonly bucketRegionalDomainName: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;
    const domainName = 'frontend';

    // =========================================================
    // S3 Bucket — stores Next.js static export (out/ directory)
    //
    // IMPORTANT: bucket is NOT public.
    // Only CloudFront can read it via Origin Access Control (OAC).
    // This is the secure modern approach — no public bucket policy,
    // no static website hosting enabled.
    //
    // Flow: User → CloudFront → OAC → S3 (private)
    // OAC is configured in the edge stack, not here.
    // =========================================================
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${appName}-${envName}-frontend`,

      // Block all public access — CloudFront is the only entry point
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // Versioning off — static site files are replaced on each deploy,
      // no need to keep old versions. Keeps storage costs minimal.
      versioned: false,

      // CORS — not needed here since CloudFront handles CORS at the edge
      // and the frontend is served directly, not via cross-origin fetch

      // Encryption at rest
      encryption: s3.BucketEncryption.S3_MANAGED,

      // RETAIN on prod — never accidentally delete prod frontend files
      // DESTROY on dev — clean teardown during development
      removalPolicy: envName === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,

      // autoDeleteObjects only works with DESTROY — removes all objects
      // before deleting the bucket so CDK teardown doesn't fail
      autoDeleteObjects: envName !== 'prod'
    });

    // Expose for edge stack to use
    this.bucketName = this.bucket.bucketName;
    this.bucketRegionalDomainName = this.bucket.bucketRegionalDomainName;

    // =========================================================
    // SSM Exports
    //
    // bucket-name          → frontend Jenkinsfile (aws s3 sync)
    // bucket-arn           → edge stack (OAC bucket policy)
    // bucket-regional-domain → edge stack (CloudFront origin)
    // =========================================================
    exportParam(this, appName, envName, domainName, 'bucket-name', this.bucket.bucketName);
    exportParam(this, appName, envName, domainName, 'bucket-arn', this.bucket.bucketArn);
    exportParam(this, appName, envName, domainName, 'bucket-regional-domain', this.bucket.bucketRegionalDomainName);
  }
}