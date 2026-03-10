import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
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

// Import after mocks
import { handler } from '../../../src/user/getUserProfile/index';
import * as auth from '../../../src/shared/auth';

// ── Test data ─────────────────────────────────────────────
const MOCK_PROFILE = {
    PK: `USER#${TEST_USER_ID}`,
    SK: 'PROFILE',
    userId: TEST_USER_ID,
    email: TEST_EMAIL,
    name: 'Niketan',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z'
};

describe('getUserProfile', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing from JWT', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await handler(buildEvent()) as any;
            expect(result.statusCode).toBe(401);
            expect(JSON.parse(result.body).data).toBeNull();
        });
    });

    describe('Not Found', () => {
        it('returns 404 when profile does not exist', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            const result = await handler(buildEvent()) as any;
            expect(result.statusCode).toBe(404);
            expect(JSON.parse(result.body).message).toBe('User profile not found');
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with profile', async () => {
            ddbMock.on(GetCommand).resolves({ Item: MOCK_PROFILE });
            const result = await handler(buildEvent()) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.userId).toBe(TEST_USER_ID);
            expect(body.data.name).toBe('Niketan');
            expect(body.data.currency).toBe('INR');
            expect(body.data.timezone).toBe('Asia/Kolkata');
        });

        it('strips PK and SK from response', async () => {
            ddbMock.on(GetCommand).resolves({ Item: MOCK_PROFILE });
            const result = await handler(buildEvent()) as any;
            const body = JSON.parse(result.body);
            expect(body.data.PK).toBeUndefined();
            expect(body.data.SK).toBeUndefined();
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(GetCommand).rejects(new Error('DynamoDB unavailable'));
            const result = await handler(buildEvent()) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});