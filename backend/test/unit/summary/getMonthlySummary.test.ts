import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as getMonthlySummaryHandler } from '../../../src/summary/getMonthlySummary/index';
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
const MOCK_MONTHLY_TOTAL = {
    PK: `USER#${TEST_USER_ID}`,
    SK: 'SUMMARY#2025#06#ALL',
    userId: TEST_USER_ID,
    totalCredit: 4500000,
    totalDebit: 62000,
    netBalance: 4438000,
    txnCount: 3,
    updatedAt: '2025-06-05T00:00:00.000Z'
};

describe('getMonthlySummary', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await getMonthlySummaryHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when month is missing', async () => {
            const result = await getMonthlySummaryHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when month format is wrong', async () => {
            const result = await getMonthlySummaryHandler(buildEvent({ queryStringParameters: { month: '06-2025' } })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path', () => {
        it('returns zeroed summary when no data exists for the month', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            const result = await getMonthlySummaryHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.totalCredit).toBe(0);
            expect(body.data.totalDebit).toBe(0);
            expect(body.data.netBalance).toBe(0);
            expect(body.data.savingsRate).toBe(0);
            expect(body.data.txnCount).toBe(0);
            expect(body.data.month).toBe('2025-06');
        });

        it('returns monthly summary with computed savingsRate', async () => {
            ddbMock.on(GetCommand).resolves({ Item: MOCK_MONTHLY_TOTAL });
            const result = await getMonthlySummaryHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.totalCredit).toBe(4500000);
            expect(body.data.totalDebit).toBe(62000);
            expect(body.data.netBalance).toBe(4438000);
            expect(body.data.txnCount).toBe(3);
            // savingsRate = netBalance / totalCredit * 100 = 4438000 / 4500000 * 100 ≈ 98.62
            expect(body.data.savingsRate).toBeCloseTo(98.62, 1);
        });

        it('returns savingsRate of 0 when totalCredit is 0', async () => {
            ddbMock.on(GetCommand).resolves({
                Item: { ...MOCK_MONTHLY_TOTAL, totalCredit: 0, netBalance: -62000 }
            });
            const result = await getMonthlySummaryHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(JSON.parse(result.body).data.savingsRate).toBe(0);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));
            const result = await getMonthlySummaryHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});
