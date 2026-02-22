import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface EdgeStackProps extends StackProps {
  appName: string;
  envName: string;
  // Passed from frontend stack via bin/expense-tracker-iac.ts
  bucketName: string;
  bucketRegionalDomainName: string;
}

export class ExpenseTrackerEdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const { appName, envName, bucketName, bucketRegionalDomainName } = props;

    // =========================================================
    // SSM — edge stack writes to ap-south-1 SSM even though
    // this stack deploys to us-east-1. We do this by explicitly
    // specifying the region in the SSM parameter name lookup.
    //
    // However, CDK SSM StringParameter always writes to the stack's
    // region (us-east-1 here). To write to ap-south-1 we use
    // CfnParameter directly with the correct region, OR we accept
    // that these params live in us-east-1 and the Jenkinsfile
    // reads from us-east-1.
    //
    // Simplest approach: write SSM to us-east-1 and read from
    // us-east-1 in Jenkinsfile for these specific params.
    // =========================================================
    const exportParam = (name: string, value: string) => {
      new ssm.StringParameter(this, `SSMParam-${name}`, {
        parameterName: `/${appName}/${envName}/edge/${name}`,
        stringValue: value,
        description: `${appName} ${envName} edge — ${name}`
      });
    };

    // =========================================================
    // Import the S3 bucket from frontend stack
    // We use fromBucketAttributes so this stack doesn't create
    // or own the bucket — it just references it.
    // =========================================================
    const bucket = s3.Bucket.fromBucketAttributes(this, 'FrontendBucket', {
      bucketName,
      bucketRegionalDomainName
    });

    // =========================================================
    // Origin Access Control (OAC)
    //
    // OAC is the modern replacement for OAI (Origin Access Identity).
    // It allows CloudFront to authenticate to S3 using SigV4 signing.
    //
    // How it works:
    //   1. CloudFront signs every request to S3 with SigV4
    //   2. S3 bucket policy allows only CloudFront service principal
    //   3. No public access to S3 at all — CloudFront is the gatekeeper
    //
    // Why OAC over OAI:
    //   - OAI is legacy and AWS recommends OAC for all new distributions
    //   - OAC supports SSE-KMS encrypted buckets (OAI does not)
    //   - Better security — uses short-lived signed requests
    // =========================================================
    const oac = new cloudfront.CfnOriginAccessControl(this, 'OAC', {
      originAccessControlConfig: {
        name: `${appName}-${envName}-oac`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4'
      }
    });

    // =========================================================
    // CloudFront Distribution
    //
    // No custom domain — using *.cloudfront.net default domain.
    // No ACM certificate needed without a custom domain.
    //
    // Cache behaviour:
    //   - HTML files: short TTL (5 min) — gets fresh content after deploy
    //   - Static assets (JS/CSS): long TTL (1 year) — content-hashed by Next.js
    //
    // Error pages:
    //   - 403/404 from S3 → serve /index.html with 200
    //   - This is required for Next.js client-side routing to work
    //     When user refreshes /dashboard, S3 returns 403 (file not found)
    //     CloudFront intercepts and serves index.html instead
    //     Next.js router then handles the /dashboard route client-side
    // =========================================================
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${appName}-${envName} frontend`,

      defaultRootObject: 'index.html',

      defaultBehavior: {
        // Point to S3 bucket — OAC is attached below via L1 escape hatch
        origin: new origins.S3Origin(bucket),

        // HTTPS only — redirect HTTP to HTTPS
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

        // Use managed cache policy — CachingOptimized
        // Caches based on Accept-Encoding header, gzip/brotli support
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,

        // Allowed methods — GET and HEAD only (static site, no POST)
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,

        // Compress responses automatically — gzip/brotli
        compress: true
      },

      // ─────────────────────────────────────────────────────
      // Error responses — required for Next.js SPA routing
      // ─────────────────────────────────────────────────────
      errorResponses: [
        {
          // S3 returns 403 when file not found (bucket is private)
          // Serve index.html so Next.js router handles the route
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0)  // don't cache error responses
        },
        {
          // S3 returns 404 for missing files
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0)
        }
      ],

      // Price class — only use edge locations in cheapest regions
      // PriceClass.PRICE_CLASS_100 = US, Canada, Europe only
      // PriceClass.PRICE_CLASS_200 = + Asia, Middle East, Africa
      // PriceClass.ALL = all edge locations (most expensive)
      // Using 200 since users are in India (ap-south-1)
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,

      // HTTP/2 + HTTP/3 support
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,

      // No geo restriction — serve to India only since users are in India
      geoRestriction: cloudfront.GeoRestriction.allowlist('IN')
    });

    // ─────────────────────────────────────────────────────────
    // Attach OAC to the distribution via L1 escape hatch
    //
    // CDK L2 constructs don't support OAC directly yet — we
    // need to drop down to CloudFormation (L1) to wire it up.
    //
    // What this does:
    //   1. Gets the underlying CloudFormation Distribution resource
    //   2. Finds the first origin (our S3 bucket)
    //   3. Sets the OAC ID on that origin
    //   4. Removes the legacy OAI if CDK added one automatically
    // ─────────────────────────────────────────────────────────
    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;

    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.getAtt('Id')
    );

    // Remove S3OriginConfig.OriginAccessIdentity that CDK adds by default
    // (empty string means "no OAI" — OAC takes over)
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      ''
    );

    // ─────────────────────────────────────────────────────────
    // S3 Bucket Policy — allow CloudFront OAC to read objects
    //
    // This grants the CloudFront distribution permission to
    // GetObject from the S3 bucket using the OAC.
    //
    // The condition ensures ONLY this specific distribution
    // can access the bucket — not any other CloudFront distribution.
    // ─────────────────────────────────────────────────────────
    bucket.addToResourcePolicy(
      new (require('aws-cdk-lib/aws-iam').PolicyStatement)({
        effect: require('aws-cdk-lib/aws-iam').Effect.ALLOW,
        principals: [
          new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('cloudfront.amazonaws.com')
        ],
        actions: ['s3:GetObject'],
        resources: [`${bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
          }
        }
      })
    );

    // =========================================================
    // SSM Exports
    //
    // NOTE: these params are written to us-east-1 (this stack's region)
    // The frontend Jenkinsfile must read them with --region us-east-1
    //
    // cloudfront-domain    → frontend Jenkinsfile (verify deploy)
    //                      → backend SAM (CORS allowed origin)
    // distribution-id      → frontend Jenkinsfile (cache invalidation)
    // =========================================================
    exportParam('cloudfront-domain', distribution.distributionDomainName);
    exportParam('distribution-id', distribution.distributionId);

    // CloudFormation output — visible in AWS console after deploy
    new CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL for the frontend'
    });
  }
}