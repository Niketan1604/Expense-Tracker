import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as updateCategoryHandler } from '../../../src/category/updateCategory/index';
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

describe('updateCategory', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await updateCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' }, body: { name: 'Updated' } })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when categoryId path param is missing', async () => {
            const result = await updateCategoryHandler(buildEvent({ body: { name: 'Updated' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when body is empty object', async () => {
            const result = await updateCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' }, body: {} })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Not Found', () => {
        it('returns 404 when category does not exist', async () => {
            const err = Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' });
            ddbMock.on(UpdateCommand).rejects(err);
            const result = await updateCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' }, body: { name: 'Updated' } })) as any;
            expect(result.statusCode).toBe(404);
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with updated category', async () => {
            ddbMock.on(UpdateCommand).resolves({
                Attributes: { ...MOCK_CATEGORY, name: 'Updated Food' }
            });
            const result = await updateCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' }, body: { name: 'Updated Food' } })) as any;
            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body).data.name).toBe('Updated Food');
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws generic error', async () => {
            ddbMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));
            const result = await updateCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' }, body: { name: 'Updated' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});