import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as deleteBudgetHandler } from '../../../src/budget/deleteBudget/index';
import * as auth from '../../../src/shared/auth';

// The mock must wrap DynamoDBDocumentClient at the class level
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

describe('deleteBudget', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await deleteBudgetHandler(buildEvent({ pathParameters: { categoryId: 'cat_food' }, queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when categoryId path param is missing', async () => {
            const result = await deleteBudgetHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when month query param is missing', async () => {
            const result = await deleteBudgetHandler(buildEvent({ pathParameters: { categoryId: 'cat_food' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when month format is wrong', async () => {
            const result = await deleteBudgetHandler(buildEvent({ pathParameters: { categoryId: 'cat_food' }, queryStringParameters: { month: '06-2025' } })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Not Found', () => {
        it('returns 404 when budget does not exist', async () => {
            const err = Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' });
            ddbMock.on(DeleteCommand).rejects(err);
            const result = await deleteBudgetHandler(buildEvent({ pathParameters: { categoryId: 'cat_food' }, queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(404);
        });
    });

    describe('Happy Path', () => {
        it('returns 200 with deleted confirmation', async () => {
            ddbMock.on(DeleteCommand).resolves({});
            const result = await deleteBudgetHandler(buildEvent({ pathParameters: { categoryId: 'cat_food' }, queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.categoryId).toBe('cat_food');
            expect(body.data.month).toBe('2025-06');
            expect(body.data.deleted).toBe(true);
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws generic error', async () => {
            ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));
            const result = await deleteBudgetHandler(buildEvent({ pathParameters: { categoryId: 'cat_food' }, queryStringParameters: { month: '2025-06' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});