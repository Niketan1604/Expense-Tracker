import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cr from 'aws-cdk-lib/custom-resources';

import { exportParam } from '../utils/parameter-utils';

interface EdgeStackProps extends StackProps {
  appName: string;
  envName: string;
  // Passed from frontend stack via bin/flowmint-iac.ts
  bucketName: string;
  bucketRegionalDomainName: string;
}

export class FlowmintEdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const { appName, envName, bucketName, bucketRegionalDomainName } = props;
    const domainName = 'edge';

    // =========================================================
    // SSM — edge stack writes to us-east-1 (this stack's region).
    // Jenkinsfile reads these params with --region us-east-1.
    // =========================================================
    const exportEdgeParam = (name: string, value: string) => {
      // Write to us-east-1 (stack's region) — for IAC pipeline context reads
      exportParam(this, appName, envName, domainName, name, value);

      // Also write to ap-south-1 — so backend + cognito stacks can resolve it
      new cr.AwsCustomResource(this, `SSMParam-${name}-ApSouth1`, {
        onCreate: {
          service: 'SSM',
          action: 'putParameter',
          parameters: {
            Name: `/${appName}/${envName}/edge/${name}`,
            Value: value,
            Type: 'String',
            Overwrite: true
          },
          physicalResourceId: cr.PhysicalResourceId.of(`${appName}-${envName}-edge-${name}-ap-south-1`),
          region: 'ap-south-1'
        },
        onUpdate: {
          service: 'SSM',
          action: 'putParameter',
          parameters: {
            Name: `/${appName}/${envName}/edge/${name}`,
            Value: value,
            Type: 'String',
            Overwrite: true
          },
          physicalResourceId: cr.PhysicalResourceId.of(`${appName}-${envName}-edge-${name}-ap-south-1`),
          region: 'ap-south-1'
        },
        onDelete: {
          service: 'SSM',
          action: 'deleteParameter',
          parameters: { Name: `/${appName}/${envName}/edge/${name}` },
          region: 'ap-south-1'
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
            resources: [
              `arn:aws:ssm:ap-south-1:${this.account}:parameter/${appName}/${envName}/edge/*`
            ]
          })
        ])
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
    // CloudFront Function — URI rewriting for static export
    //
    // Next.js `output: 'export'` generates files like:
    //   login/index.html, dashboard/index.html, etc.
    //
    // When a user requests /login, S3 looks for key "login" which
    // doesn't exist — S3 returns 403 (private bucket) and CloudFront
    // falls back to /index.html (the root page).
    //
    // This function rewrites /login → /login/index.html BEFORE
    // the request reaches S3, so S3 finds the correct file.
    //
    // Rules:
    //   /              → /index.html  (handled by defaultRootObject)
    //   /login         → /login/index.html
    //   /dashboard     → /dashboard/index.html
    //   /foo.js        → /foo.js  (unchanged — has extension)
    //   /login/        → /login/index.html
    // =========================================================
    const uriRewriteFunction = new cloudfront.Function(this, 'UriRewriteFunction', {
      functionName: `${appName}-${envName}-uri-rewrite`,
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;

          // If URI has a file extension, serve as-is (JS, CSS, images, etc.)
          if (uri.includes('.')) {
            return request;
          }

          // If URI ends with /, append index.html
          if (uri.endsWith('/')) {
            request.uri = uri + 'index.html';
          } else {
            // Append .html for clean URLs like /login, /dashboard
            request.uri = uri + '.html';
          }

          return request;
        }
      `),
    });

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

        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,

        // Allowed methods — GET and HEAD only (static site, no POST)
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,

        // Compress responses automatically — gzip/brotli
        compress: true,

        // Attach URI rewrite function — runs on every viewer request
        // Rewrites /login → /login/index.html so S3 finds the file
        functionAssociations: [{
          function: uriRewriteFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
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
    // WHY AwsCustomResource instead of bucket.addToResourcePolicy():
    //   bucket is an imported resource (fromBucketAttributes), and CDK's
    //   addToResourcePolicy() is a NO-OP on imported buckets — it silently
    //   does nothing and never creates the policy. This is a known CDK
    //   limitation. AwsCustomResource calls the S3 PutBucketPolicy API
    //   directly via a Lambda-backed custom resource, bypassing CDK's
    //   ownership check.
    //
    // WHY region: 'ap-south-1' on every call:
    //   This stack deploys to us-east-1. Without an explicit region,
    //   the Lambda hits the us-east-1 S3 endpoint — which rejects
    //   requests for buckets in other regions with:
    //   "The bucket must be addressed using the specified endpoint."
    //   Passing region: 'ap-south-1' tells the AWS SDK inside the Lambda
    //   to use the correct regional endpoint for the bucket.
    //
    // The condition ensures ONLY this specific distribution can access
    // the bucket — not any other CloudFront distribution.
    // ─────────────────────────────────────────────────────────
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowCloudFrontOAC',
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucketName}/*`,
          Condition: {
            StringEquals: {
              'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
            }
          }
        }
      ]
    };

    // Role for the custom resource Lambda to put the bucket policy
    // Must have s3:PutBucketPolicy on the frontend bucket
    const customResourceRole = new iam.Role(this, 'BucketPolicyCustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        PutBucketPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:PutBucketPolicy', 's3:GetBucketPolicy'],
              // S3 bucket policy ARNs never include region
              resources: [`arn:aws:s3:::${bucketName}`]
            })
          ]
        })
      }
    });

    new cr.AwsCustomResource(this, 'FrontendBucketPolicy', {
      role: customResourceRole,
      onCreate: {
        service: 'S3',
        action: 'putBucketPolicy',
        parameters: {
          Bucket: bucketName,
          Policy: JSON.stringify(bucketPolicy)
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${bucketName}-oac-policy`),
        region: 'ap-south-1'  // bucket lives in ap-south-1, stack is in us-east-1
      },
      onUpdate: {
        service: 'S3',
        action: 'putBucketPolicy',
        parameters: {
          Bucket: bucketName,
          Policy: JSON.stringify(bucketPolicy)
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${bucketName}-oac-policy`),
        region: 'ap-south-1'  // bucket lives in ap-south-1, stack is in us-east-1
      },
      onDelete: {
        service: 'S3',
        action: 'deleteBucketPolicy',
        parameters: {
          Bucket: bucketName
        },
        region: 'ap-south-1'  // bucket lives in ap-south-1, stack is in us-east-1
      }
    });

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
    exportEdgeParam('cloudfront-domain', distribution.distributionDomainName);
    exportEdgeParam('distribution-id', distribution.distributionId);

    // CloudFormation output — visible in AWS console after deploy
    new CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL for the frontend'
    });
  }
}