import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID, TEST_EMAIL } from '../../helpers/eventBuilder';

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

import { handler } from '../../../src/user/putUserProfile/index';
import * as auth from '../../../src/shared/auth';

// ── Test data ─────────────────────────────────────────────
const VALID_BODY = { name: 'Niketan', currency: 'INR', timezone: 'Asia/Kolkata' };

describe('putUserProfile', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
        (auth.getUserEmail as jest.Mock).mockReturnValue(TEST_EMAIL);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await handler(buildEvent({ body: VALID_BODY })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when name is missing', async () => {
            const result = await handler(buildEvent({ body: { currency: 'INR', timezone: 'Asia/Kolkata' } })) as any;
            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).message).toMatch(/name/i);
        });

        it('returns 400 when name is empty string', async () => {
            const result = await handler(buildEvent({ body: { name: '', currency: 'INR', timezone: 'Asia/Kolkata' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when currency is missing', async () => {
            const result = await handler(buildEvent({ body: { name: 'Niketan', timezone: 'Asia/Kolkata' } })) as any;
            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).message).toMatch(/currency/i);
        });

        it('returns 400 when timezone is missing', async () => {
            const result = await handler(buildEvent({ body: { name: 'Niketan', currency: 'INR' } })) as any;
            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).message).toMatch(/timezone/i);
        });

        it('returns 400 for invalid JSON body', async () => {
            const event = buildEvent({ body: VALID_BODY });
            (event as any).body = 'not-valid-json';
            const result = await handler(event) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path — Create', () => {
        it('returns 200 with created profile', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            ddbMock.on(PutCommand).resolves({});
            const result = await handler(buildEvent({ body: VALID_BODY })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.userId).toBe(TEST_USER_ID);
            expect(body.data.name).toBe('Niketan');
            expect(body.data.currency).toBe('INR');
            expect(body.data.timezone).toBe('Asia/Kolkata');
            expect(body.data.createdAt).toBeDefined();
            expect(body.data.updatedAt).toBeDefined();
        });

        it('uppercases currency', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            ddbMock.on(PutCommand).resolves({});
            const result = await handler(buildEvent({ body: { ...VALID_BODY, currency: 'inr' } })) as any;
            expect(JSON.parse(result.body).data.currency).toBe('INR');
        });

        it('strips PK and SK from response', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            ddbMock.on(PutCommand).resolves({});
            const result = await handler(buildEvent({ body: VALID_BODY })) as any;
            const body = JSON.parse(result.body);
            expect(body.data.PK).toBeUndefined();
            expect(body.data.SK).toBeUndefined();
        });
    });

    describe('Happy Path — Update', () => {
        it('preserves createdAt when profile already exists', async () => {
            const originalCreatedAt = '2025-01-01T00:00:00.000Z';
            ddbMock.on(GetCommand).resolves({ Item: { createdAt: originalCreatedAt } });
            ddbMock.on(PutCommand).resolves({});
            const result = await handler(buildEvent({ body: { ...VALID_BODY, name: 'Updated' } })) as any;
            expect(JSON.parse(result.body).data.createdAt).toBe(originalCreatedAt);
        });

        it('updates updatedAt on every call', async () => {
            const originalCreatedAt = '2025-01-01T00:00:00.000Z';
            ddbMock.on(GetCommand).resolves({ Item: { createdAt: originalCreatedAt } });
            ddbMock.on(PutCommand).resolves({});
            const result = await handler(buildEvent({ body: VALID_BODY })) as any;
            const body = JSON.parse(result.body);
            expect(body.data.updatedAt).not.toBe(originalCreatedAt);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(GetCommand).rejects(new Error('DynamoDB unavailable'));
            const result = await handler(buildEvent({ body: VALID_BODY })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});