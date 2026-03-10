import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler } from '../../../src/transaction/createTransaction/index';
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
const VALID_DEBIT = {
    type: 'DEBIT',
    amount: 50000,
    categoryId: 'cat_food',
    date: '2025-06-01'
};

const VALID_CREDIT = {
    type: 'CREDIT',
    amount: 4500000,
    categoryId: 'cat_salary',
    date: '2025-06-05'
};

describe('createTransaction', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await handler(buildEvent({ body: VALID_DEBIT })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when type is missing', async () => {
            const { type, ...body } = VALID_DEBIT;
            const result = await handler(buildEvent({ body })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when type is invalid value', async () => {
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, type: 'TRANSFER' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is missing', async () => {
            const { amount, ...body } = VALID_DEBIT;
            const result = await handler(buildEvent({ body })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is zero', async () => {
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, amount: 0 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is negative', async () => {
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, amount: -100 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when amount is a float', async () => {
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, amount: 500.50 } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when categoryId is missing', async () => {
            const { categoryId, ...body } = VALID_DEBIT;
            const result = await handler(buildEvent({ body })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when date is missing', async () => {
            const { date, ...body } = VALID_DEBIT;
            const result = await handler(buildEvent({ body })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when date format is wrong', async () => {
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, date: '01-06-2025' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when description exceeds 500 chars', async () => {
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, description: 'x'.repeat(501) } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when body is null', async () => {
            const result = await handler(buildEvent({ body: null })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path', () => {
        it('returns 201 on valid DEBIT transaction', async () => {
            ddbMock.on(TransactWriteCommand).resolves({});
            const result = await handler(buildEvent({ body: VALID_DEBIT })) as any;
            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            expect(body.status).toBe(201);
            expect(body.data.transactionId).toBeDefined();
            expect(body.data.type).toBe('DEBIT');
            expect(body.data.amount).toBe(50000);
            expect(body.data.categoryId).toBe('cat_food');
            expect(body.data.userId).toBe(TEST_USER_ID);
            expect(body.data.createdAt).toBeDefined();
            expect(body.data.updatedAt).toBeDefined();
        });

        it('returns 201 on valid CREDIT transaction', async () => {
            ddbMock.on(TransactWriteCommand).resolves({});
            const result = await handler(buildEvent({ body: VALID_CREDIT })) as any;
            expect(result.statusCode).toBe(201);
            expect(JSON.parse(result.body).data.type).toBe('CREDIT');
        });

        it('accepts optional description', async () => {
            ddbMock.on(TransactWriteCommand).resolves({});
            const result = await handler(buildEvent({ body: { ...VALID_DEBIT, description: 'Lunch' } })) as any;
            expect(result.statusCode).toBe(201);
            expect(JSON.parse(result.body).data.description).toBe('Lunch');
        });

        it('does not include PK SK GSI keys in response', async () => {
            ddbMock.on(TransactWriteCommand).resolves({});
            const result = await handler(buildEvent({ body: VALID_DEBIT })) as any;
            const body = JSON.parse(result.body);
            expect(body.data.PK).toBeUndefined();
            expect(body.data.SK).toBeUndefined();
            expect(body.data.GSI1PK).toBeUndefined();
            expect(body.data.GSI1SK).toBeUndefined();
            expect(body.data.GSI2PK).toBeUndefined();
        });
    });

    describe('Errors', () => {
        it('returns 500 when TransactWrite throws', async () => {
            ddbMock.on(TransactWriteCommand).rejects(new Error('DynamoDB error'));
            const result = await handler(buildEvent({ body: VALID_DEBIT })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});