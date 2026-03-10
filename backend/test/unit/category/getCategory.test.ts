import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as getCategoriesHandler } from '../../../src/category/getCategories/index';
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
const MOCK_CATEGORY = {
    PK: `USER#${TEST_USER_ID}`,
    SK: 'CATEGORY#cat_abc',
    categoryId: 'cat_abc',
    userId: TEST_USER_ID,
    name: 'Food',
    icon: '🍔',
    color: '#FF6B6B',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z'
};

describe('getCategories', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await getCategoriesHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with empty array when no categories', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await getCategoriesHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body).data).toEqual([]);
        });

        it('returns 200 with categories', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [MOCK_CATEGORY] });
            const result = await getCategoriesHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data).toHaveLength(1);
            expect(body.data[0].categoryId).toBe('cat_abc');
            expect(body.data[0].name).toBe('Food');
        });

        it('strips PK and SK from each item', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [MOCK_CATEGORY] });
            const result = await getCategoriesHandler(buildEvent()) as any;
            const body = JSON.parse(result.body);
            expect(body.data[0].PK).toBeUndefined();
            expect(body.data[0].SK).toBeUndefined();
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));
            const result = await getCategoriesHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});