import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { exportParam } from '../utils/parameter-utils';

interface DatabaseStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class FlowmintDatabaseStack extends Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;
    const domainName = 'database';

    // =========================================================
    // DynamoDB Single Table
    //
    // Key structure per entity:
    //
    // Entity           PK                    SK
    // ──────────────────────────────────────────────────────────
    // UserProfile      USER#{userId}         PROFILE
    // Category         USER#{userId}         CATEGORY#{categoryId}
    // Budget           USER#{userId}         BUDGET#{yyyy}#{mm}#{categoryId}
    // Transaction      USER#{userId}         TXN#{yyyy-mm-dd}#{txnId}
    // MonthlySummary   USER#{userId}         SUMMARY#{yyyy}#{mm}#{categoryId}
    // MonthlyTotal     USER#{userId}         SUMMARY#{yyyy}#{mm}#ALL
    //
    // Aggregation strategy:
    //   TransactWriteItems on every transaction write — atomically
    //   updates MonthlySummary and MonthlyTotal in the same transaction.
    //   No streams/async aggregation needed.
    //
    // Stream is kept enabled for future use (notifications etc.)
    // but no Lambda trigger is attached right now.
    // =========================================================
    this.table = new dynamodb.Table(this, 'MainTable', {
      tableName: `${appName}-${envName}-main`,

      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },

      // PAY_PER_REQUEST — no capacity planning, scales to zero when idle
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      // PITR — restore to any second in the last 35 days
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },

      // AWS_MANAGED — KMS key managed by DynamoDB, no extra cost
      encryption: dynamodb.TableEncryption.AWS_MANAGED,

      // Stream kept enabled for future use (no trigger attached yet)
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,

      // RETAIN on prod — cdk destroy will NOT delete the table
      // DESTROY on dev — clean teardown during development
      removalPolicy: envName === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY
    });

    // =========================================================
    // GSI1 — Transactions by category
    //
    // GSI1PK: USER#{userId}#CAT#{categoryId}
    // GSI1SK: TXN#{yyyy-mm-dd}#{txnId}
    //
    // Enables:
    //   - List all transactions for a user+category (date sorted)
    //   - List transactions for a user+category in a date range
    //   - Category breakdown for analytics
    //
    // Only Transaction items carry GSI1PK/GSI1SK — all other
    // entity types are invisible to this index automatically.
    //
    // Projection ALL — avoids a second GetItem after GSI query
    // =========================================================
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // =========================================================
    // GSI2 — Transactions by type (CREDIT / DEBIT)
    //
    // GSI2PK: USER#{userId}#TYPE#{CREDIT|DEBIT}
    // GSI2SK: TXN#{yyyy-mm-dd}#{txnId}  (reuses SK — no extra attribute)
    //
    // Enables:
    //   - List only CREDIT transactions for a user (date sorted)
    //   - List only DEBIT transactions for a user (date sorted)
    //   - Type-filtered views in the frontend transaction feed
    //   - Top income sources (CREDIT) / top spending (DEBIT)
    //
    // Sparse index — only Transaction items carry GSI2PK.
    // UserProfile, Category, Budget, Summary items are invisible.
    //
    // Projection ALL — avoids a second GetItem after GSI query
    // =========================================================
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // =========================================================
    // SSM Exports
    //
    // Consumed by:
    //   - backend Jenkinsfile (reads before sam deploy)
    //   - SAM template (passed as --parameter-overrides)
    //   - Lambda functions (TABLE_NAME env var + IAM policy)
    //
    // Convention: /{appName}/{envName}/database/{key}
    // =========================================================
    exportParam(this, appName, envName, domainName, 'table-name', this.table.tableName);
    exportParam(this, appName, envName, domainName, 'table-arn', this.table.tableArn);
    exportParam(this, appName, envName, domainName, 'gsi1-arn', `${this.table.tableArn}/index/GSI1`);
    exportParam(this, appName, envName, domainName, 'gsi2-arn', `${this.table.tableArn}/index/GSI2`);
    exportParam(this, appName, envName, domainName, 'stream-arn', this.table.tableStreamArn ?? 'stream-not-enabled');
  }
}