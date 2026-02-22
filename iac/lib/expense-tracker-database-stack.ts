import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface DatabaseStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class ExpenseTrackerDatabaseStack extends Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;

    const exportParam = (name: string, value: string) => {
      new ssm.StringParameter(this, `SSMParam-${name}`, {
        parameterName: `/${appName}/${envName}/database/${name}`,
        stringValue: value,
        description: `${appName} ${envName} database — ${name}`
      });
    };

    // =========================================================
    // DynamoDB Single Table
    //
    // Key structure per entity:
    //
    // Entity          PK                    SK
    // ─────────────────────────────────────────────────────────
    // User Profile    USER#{userId}         PROFILE
    // Category        USER#{userId}         CATEGORY#{categoryId}
    // Budget          USER#{userId}         BUDGET#{yyyy}#{mm}#{categoryId}
    // Expense         USER#{userId}         EXPENSE#{yyyy-mm-dd}#{expenseId}
    // Monthly Summary USER#{userId}         SUMMARY#{yyyy}#{mm}#{categoryId}
    // Monthly Total   USER#{userId}         SUMMARY#{yyyy}#{mm}#ALL
    //
    // Aggregation strategy:
    //   TransactWriteItems on every expense write — atomically
    //   updates SUMMARY and SUMMARY#ALL in the same transaction.
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
    // GSI1 — Category-scoped expense queries
    //
    // GSI1PK: USER#{userId}#CAT#{categoryId}
    // GSI1SK: EXPENSE#{yyyy-mm-dd}#{expenseId}
    //
    // Enables:
    //   - List all expenses for a user+category (date sorted)
    //   - List expenses for a user+category in a date range
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
    // SSM Exports
    //
    // Consumed by:
    //   - backend Jenkinsfile (reads before sam deploy)
    //   - SAM template (passed as --parameter-overrides)
    //   - Lambda functions (TABLE_NAME env var + IAM policy)
    //
    // Convention: /{appName}/{envName}/database/{key}
    // =========================================================
    exportParam('table-name', this.table.tableName);
    exportParam('table-arn', this.table.tableArn);
    exportParam('gsi1-arn', `${this.table.tableArn}/index/GSI1`);
    exportParam('stream-arn', this.table.tableStreamArn ?? 'stream-not-enabled');
  }
}