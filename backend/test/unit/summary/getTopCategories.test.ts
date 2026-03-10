import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as getTopCategoriesHandler } from '../../../src/summary/getTopCategories/index';
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
const MOCK_CATEGORY_SUMMARIES = [
    {
        PK: `USER#${TEST_USER_ID}`,
        SK: 'SUMMARY#2025#06#cat_food',
        userId: TEST_USER_ID,
        categoryId: 'cat_food',
        totalCredit: 0,
        totalDebit: 50000,
        netBalance: -50000,
        txnCount: 1,
        updatedAt: '2025-06-01T00:00:00.000Z'
    },
    {
        PK: `USER#${TEST_USER_ID}`,
        SK: 'SUMMARY#2025#06#cat_salary',
        userId: TEST_USER_ID,
        categoryId: 'cat_salary',
        totalCredit: 4500000,
        totalDebit: 0,
        netBalance: 4500000,
        txnCount: 1,
        updatedAt: '2025-06-05T00:00:00.000Z'
    }
];

describe('getTopCategories', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await getTopCategoriesHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when month is missing', async () => {
            const result = await getTopCategoriesHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when type is invalid', async () => {
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06', type: 'TRANSFER' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when limit exceeds 20', async () => {
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06', limit: '21' } })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path', () => {
        it('returns top categories sorted by totalDebit when type is DEBIT', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: MOCK_CATEGORY_SUMMARIES });
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06', type: 'DEBIT' } })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            // cat_food has totalDebit 50000, cat_salary has 0 — cat_food should be first
            expect(body.data.topCategories[0].categoryId).toBe('cat_food');
        });

        it('returns top categories sorted by totalCredit when type is CREDIT', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: MOCK_CATEGORY_SUMMARIES });
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06', type: 'CREDIT' } })) as any;
            const body = JSON.parse(result.body);
            // cat_salary has totalCredit 4500000 — should be first
            expect(body.data.topCategories[0].categoryId).toBe('cat_salary');
        });

        it('respects limit param', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: MOCK_CATEGORY_SUMMARIES });
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06', limit: '1' } })) as any;
            expect(JSON.parse(result.body).data.topCategories).toHaveLength(1);
        });

        it('returns empty array when no data', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(JSON.parse(result.body).data.topCategories).toEqual([]);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));
            const result = await getTopCategoriesHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});