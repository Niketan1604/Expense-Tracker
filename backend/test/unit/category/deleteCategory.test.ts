import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as deleteCategoryHandler } from '../../../src/category/deleteCategory/index';
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

describe('deleteCategory', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when categoryId is missing', async () => {
            const result = await deleteCategoryHandler(buildEvent()) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Conflict', () => {
        it('returns 409 when active transactions exist for category', async () => {
            ddbMock.on(QueryCommand).resolves({ Count: 3 });
            const result = await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
            expect(result.statusCode).toBe(409);
            expect(JSON.parse(result.body).message).toMatch(/transaction/i);
        });
    });

    describe('Not Found', () => {
        it('returns 404 when category does not exist', async () => {
            ddbMock.on(QueryCommand).resolves({ Count: 0 });
            const err = Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' });
            ddbMock.on(DeleteCommand).rejects(err);
            const result = await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
            expect(result.statusCode).toBe(404);
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with deleted confirmation', async () => {
            ddbMock.on(QueryCommand).resolves({ Count: 0 });
            ddbMock.on(DeleteCommand).resolves({});
            const result = await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.categoryId).toBe('cat_abc');
            expect(body.data.deleted).toBe(true);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws generic error', async () => {
            ddbMock.on(QueryCommand).resolves({ Count: 0 });
            ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));
            const result = await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});