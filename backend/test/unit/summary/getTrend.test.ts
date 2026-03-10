import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as getTrendHandler } from '../../../src/summary/getTrend/index';
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

describe('getTrend', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await getTrendHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when months exceeds 12', async () => {
            const result = await getTrendHandler(buildEvent({ queryStringParameters: { months: '13' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when months is zero', async () => {
            const result = await getTrendHandler(buildEvent({ queryStringParameters: { months: '0' } })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path', () => {
        it('defaults to 6 months when months param is not provided', async () => {
            ddbMock.on(BatchGetCommand).resolves({ Responses: { 'test-table': [] } });
            const result = await getTrendHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body).data.trend).toHaveLength(6);
        });

        it('returns N months when months param is provided', async () => {
            ddbMock.on(BatchGetCommand).resolves({ Responses: { 'test-table': [] } });
            const result = await getTrendHandler(buildEvent({ queryStringParameters: { months: '3' } })) as any;
            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body).data.trend).toHaveLength(3);
        });

        it('fills missing months with zeroed data', async () => {
            ddbMock.on(BatchGetCommand).resolves({ Responses: { 'test-table': [] } });
            const result = await getTrendHandler(buildEvent({ queryStringParameters: { months: '3' } })) as any;
            const body = JSON.parse(result.body);
            body.data.trend.forEach((m: any) => {
                expect(m.totalCredit).toBe(0);
                expect(m.totalDebit).toBe(0);
                expect(m.netBalance).toBe(0);
                expect(m.savingsRate).toBe(0);
                expect(m.txnCount).toBe(0);
                expect(m.month).toMatch(/^\d{4}-\d{2}$/);
            });
        });

        it('months are ordered oldest to newest', async () => {
            ddbMock.on(BatchGetCommand).resolves({ Responses: { 'test-table': [] } });
            const result = await getTrendHandler(buildEvent({ queryStringParameters: { months: '3' } })) as any;
            const trend = JSON.parse(result.body).data.trend;
            expect(trend[0].month < trend[1].month).toBe(true);
            expect(trend[1].month < trend[2].month).toBe(true);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(BatchGetCommand).rejects(new Error('DynamoDB error'));
            const result = await getTrendHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});
