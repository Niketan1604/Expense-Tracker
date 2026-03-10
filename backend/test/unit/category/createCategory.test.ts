import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildEvent, TEST_USER_ID } from '../../helpers/eventBuilder';
import { handler as createCategoryHandler } from '../../../src/category/createCategory/index';
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

describe('createCategory', () => {
    beforeEach(() => {
        ddbMock.reset();
        (auth.getUserId as jest.Mock).mockReturnValue(TEST_USER_ID);
    });

    describe('Auth', () => {
        it('returns 401 when userId is missing', async () => {
            (auth.getUserId as jest.Mock).mockReturnValue(undefined);
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food' } })) as any;
            expect(result.statusCode).toBe(401);
        });
    });

    describe('Validation', () => {
        it('returns 400 when name is missing', async () => {
            const result = await createCategoryHandler(buildEvent({ body: { icon: '🍔' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when name is empty string', async () => {
            const result = await createCategoryHandler(buildEvent({ body: { name: '' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when name exceeds 50 chars', async () => {
            const result = await createCategoryHandler(buildEvent({ body: { name: 'x'.repeat(51) } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when color is not valid hex', async () => {
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food', color: 'red' } })) as any;
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 when body is null', async () => {
            const result = await createCategoryHandler(buildEvent({ body: null })) as any;
            expect(result.statusCode).toBe(400);
        });
    });

    describe('Happy Path', () => {
        it('returns 201 with created category', async () => {
            ddbMock.on(PutCommand).resolves({});
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food', icon: '🍔', color: '#FF6B6B' } })) as any;
            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            expect(body.data.name).toBe('Food');
            expect(body.data.categoryId).toBeDefined();
            expect(body.data.userId).toBe(TEST_USER_ID);
        });

        it('generates a cat_ prefixed categoryId', async () => {
            ddbMock.on(PutCommand).resolves({});
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food' } })) as any;
            expect(JSON.parse(result.body).data.categoryId).toMatch(/^cat_/);
        });

        it('works without optional icon and color', async () => {
            ddbMock.on(PutCommand).resolves({});
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food' } })) as any;
            expect(result.statusCode).toBe(201);
        });

        it('strips PK and SK from response', async () => {
            ddbMock.on(PutCommand).resolves({});
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food' } })) as any;
            const body = JSON.parse(result.body);
            expect(body.data.PK).toBeUndefined();
            expect(body.data.SK).toBeUndefined();
        });
    });

    describe('Errors', () => {
        it('returns 500 when DynamoDB throws', async () => {
            ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));
            const result = await createCategoryHandler(buildEvent({ body: { name: 'Food' } })) as any;
            expect(result.statusCode).toBe(500);
        });
    });
});
