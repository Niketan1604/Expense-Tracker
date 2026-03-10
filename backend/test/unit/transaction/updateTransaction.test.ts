import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as updateTransactionHandler } from '../../../src/transaction/updateTransaction/index';
import * as auth from '../../../src/shared/auth';

// ── Mocks ─────────────────────────────────────────────────
const ddbMock = mockClient(DynamoDBDocumentClient);

jest.mock('../../../src/shared/db', () => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
  return {
    docClient: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    TABLE_NAME: 'test-table'
  };
});

jest.mock('../../../src/shared/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));

jest.mock('../../../src/shared/auth', () => ({
    getUserId: jest.fn(),
    getUserEmail: jest.fn()
}));

// ── Test data ─────────────────────────────────────────────
const MOCK_TXN = {
    PK: `USER#${TEST_USER_ID}`,
    SK: 'TXN#2025-06-01#txn-abc',
    transactionId: 'txn-abc',
    userId: TEST_USER_ID,
    type: 'DEBIT',
    amount: 50000,
    categoryId: 'cat_food',
    date: '2025-06-01',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    GSI1PK: `USER#${TEST_USER_ID}#CAT#cat_food`,
    GSI1SK: 'TXN#2025-06-01#txn-abc',
    GSI2PK: `USER#${TEST_USER_ID}#TYPE#DEBIT`
};


describe('updateTransaction', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: { amount: 75000 } })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when txnId is missing', async () => {
            const result = await updateTransactionHandler(buildEvent({ body: { amount: 75000 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when body is empty object', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [MOCK_TXN] });
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: {} })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when type is invalid', async () => {
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: { type: 'TRANSFER' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is float', async () => {
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: { amount: 100.50 } })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Not Found', () => {
        it('returns 404 when transaction does not exist', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: { amount: 75000 } })) as any;
            expect(result.statusCode).toBe(404);
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with updated transaction', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [MOCK_TXN] });
            ddbMock.on(TransactWriteCommand).resolves({});
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: { amount: 75000 } })) as any;
            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body).data.amount).toBe(75000);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [MOCK_TXN] });
            ddbMock.on(TransactWriteCommand).rejects(new Error('DynamoDB error'));
            const result = await updateTransactionHandler(buildEvent({ pathParameters: { txnId: 'txn-abc' }, body: { amount: 75000 } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});