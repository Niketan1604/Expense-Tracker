import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as getBreakdownHandler } from '../../../src/summary/getBreakdown/index';
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

describe('getBreakdown', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await getBreakdownHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when month is missing', async () => {
            const result = await getBreakdownHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with per-category breakdown', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: MOCK_CATEGORY_SUMMARIES });
            const result = await getBreakdownHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.month).toBe('2025-06');
            expect(body.data.breakdown).toHaveLength(2);
        });

        it('returns empty breakdown when no data', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await getBreakdownHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body).data.breakdown).toEqual([]);
        });

        it('strips PK and SK from each breakdown item', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: MOCK_CATEGORY_SUMMARIES });
            const result = await getBreakdownHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            const body = JSON.parse(result.body);
            body.data.breakdown.forEach((item: any) => {
                expect(item.PK).toBeUndefined();
                expect(item.SK).toBeUndefined();
            });
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));
            const result = await getBreakdownHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});
