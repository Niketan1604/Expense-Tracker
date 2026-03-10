import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as setBudgetHandler } from '../../../src/budget/setBudget/index';
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
const VALID_SET_BODY = { categoryId: 'cat_food', month: '2025-06', amount: 500000 };

describe('setBudget', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await setBudgetHandler(buildEvent({ body: VALID_SET_BODY })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when categoryId is missing', async () => {
            const result = await setBudgetHandler(buildEvent({ body: { month: '2025-06', amount: 500000 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when month is missing', async () => {
            const result = await setBudgetHandler(buildEvent({ body: { categoryId: 'cat_food', amount: 500000 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when month format is wrong', async () => {
            const result = await setBudgetHandler(buildEvent({ body: { ...VALID_SET_BODY, month: '06-2025' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is missing', async () => {
            const result = await setBudgetHandler(buildEvent({ body: { categoryId: 'cat_food', month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is float', async () => {
            const result = await setBudgetHandler(buildEvent({ body: { ...VALID_SET_BODY, amount: 500.50 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is zero', async () => {
            const result = await setBudgetHandler(buildEvent({ body: { ...VALID_SET_BODY, amount: 0 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when body is null', async () => {
            const result = await setBudgetHandler(buildEvent({ body: null })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path — Create', () => {
        it('returns 201 when budget is new', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            ddbMock.on(PutCommand).resolves({});
            const result = await setBudgetHandler(buildEvent({ body: VALID_SET_BODY })) as any;
            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            expect(body.data.categoryId).toBe('cat_food');
            expect(body.data.month).toBe('2025-06');
            expect(body.data.amount).toBe(500000);
        });

        it('strips PK and SK from response', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            ddbMock.on(PutCommand).resolves({});
            const result = await setBudgetHandler(buildEvent({ body: VALID_SET_BODY })) as any;
            const body = JSON.parse(result.body);
            expect(body.data.PK).toBeUndefined();
            expect(body.data.SK).toBeUndefined();
        });
    });

    describe('Happy Path — Update', () => {
        it('returns 200 when budget already exists', async () => {
            ddbMock.on(GetCommand).resolves({ Item: { createdAt: '2025-01-01T00:00:00.000Z' } });
            ddbMock.on(PutCommand).resolves({});
            const result = await setBudgetHandler(buildEvent({ body: { ...VALID_SET_BODY, amount: 600000 } })) as any;
            expect(result.statusCode).toBe(200);
        });

        it('preserves original createdAt on update', async () => {
            const originalCreatedAt = '2025-01-01T00:00:00.000Z';
            ddbMock.on(GetCommand).resolves({ Item: { createdAt: originalCreatedAt } });
            ddbMock.on(PutCommand).resolves({});
            const result = await setBudgetHandler(buildEvent({ body: VALID_SET_BODY })) as any;
            expect(JSON.parse(result.body).data.createdAt).toBe(originalCreatedAt);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));
            const result = await setBudgetHandler(buildEvent({ body: VALID_SET_BODY })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});
