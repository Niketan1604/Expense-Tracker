import {
    DynamoDBClient,
    CreateTableCommand,
    BillingMode,
    ScalarAttributeType,
    KeyType,
    ProjectionType
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

export const TEST_TABLE_NAME = 'flowmint-test';

let rawClient: DynamoDBClient;
export let testDocClient: DynamoDBDocumentClient;

// =========================================================
// Integration Setup
//
// Connects to DynamoDB Local (started externally via Docker).
// Creates the table with GSI1 + GSI2 before tests run.
// Clears all items between tests.
//
// Run DynamoDB Local before integration tests:
//   docker run -p 8000:8000 amazon/dynamodb-local
//
// Then: npm run test:integration
// =========================================================

export const setupIntegration = async (): Promise<void> => {
    rawClient = new DynamoDBClient({
        endpoint: 'http://localhost:8000',
        region: 'ap-south-1',
        credentials: {
            accessKeyId: 'test',
            secretAccessKey: 'test'
        }
    });

    testDocClient = DynamoDBDocumentClient.from(rawClient, {
        marshallOptions: { removeUndefinedValues: true },
        unmarshallOptions: { wrapNumbers: false }
    });

    // Set env vars so handlers pick up the test table
    process.env.TABLE_NAME = TEST_TABLE_NAME;
    process.env.AWS_REGION = 'ap-south-1';

    // Create table — ignore if already exists
    try {
        await rawClient.send(new CreateTableCommand({
            TableName: TEST_TABLE_NAME,
            BillingMode: BillingMode.PAY_PER_REQUEST,
            AttributeDefinitions: [
                { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
                { AttributeName: 'SK', AttributeType: ScalarAttributeType.S },
                { AttributeName: 'GSI1PK', AttributeType: ScalarAttributeType.S },
                { AttributeName: 'GSI1SK', AttributeType: ScalarAttributeType.S },
                { AttributeName: 'GSI2PK', AttributeType: ScalarAttributeType.S }
            ],
            KeySchema: [
                { AttributeName: 'PK', KeyType: KeyType.HASH },
                { AttributeName: 'SK', KeyType: KeyType.RANGE }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'GSI1',
                    KeySchema: [
                        { AttributeName: 'GSI1PK', KeyType: KeyType.HASH },
                        { AttributeName: 'GSI1SK', KeyType: KeyType.RANGE }
                    ],
                    Projection: { ProjectionType: ProjectionType.ALL }
                },
                {
                    IndexName: 'GSI2',
                    KeySchema: [
                        { AttributeName: 'GSI2PK', KeyType: KeyType.HASH },
                        { AttributeName: 'SK', KeyType: KeyType.RANGE }
                    ],
                    Projection: { ProjectionType: ProjectionType.ALL }
                }
            ]
        }));
    } catch (err: unknown) {
        // Table already exists — fine
        if ((err as { name?: string }).name !== 'ResourceInUseException') throw err;
    }
};

export const teardownIntegration = async (): Promise<void> => {
    if (rawClient) rawClient.destroy();
};

// Delete all items between tests — faster than dropping/recreating the table
export const clearTable = async (): Promise<void> => {
    const result = await testDocClient.send(new ScanCommand({
        TableName: TEST_TABLE_NAME,
        ProjectionExpression: 'PK, SK'
    }));

    const items = result.Items ?? [];
    if (items.length === 0) return;

    // BatchWrite limit is 25 per call
    for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        await testDocClient.send(new BatchWriteCommand({
            RequestItems: {
                [TEST_TABLE_NAME]: chunk.map(item => ({
                    DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
                }))
            }
        }));
    }
};