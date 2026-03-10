import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
    setupIntegration, teardownIntegration, clearTable,
    testDocClient, TEST_TABLE_NAME
} from '../helpers/integrationSetup';
import { buildEvent, TEST_USER_ID } from '../helpers/eventBuilder';
import { handler as getCategoriesHandler } from '../../src/category/getCategories/index';
import { handler as createCategoryHandler } from '../../src/category/createCategory/index';
import { handler as updateCategoryHandler } from '../../src/category/updateCategory/index';
import { handler as deleteCategoryHandler } from '../../src/category/deleteCategory/index';

jest.mock('../../src/shared/db', () => ({
    get docClient() { return require('../helpers/integrationSetup').testDocClient; },
    get TABLE_NAME() { return require('../helpers/integrationSetup').TEST_TABLE_NAME; }
}));
jest.mock('../../src/shared/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));
jest.mock('../../src/shared/auth', () => ({
    getUserId: jest.fn().mockReturnValue(TEST_USER_ID),
    getUserEmail: jest.fn().mockReturnValue('test@flowmint.dev')
}));


// ── Helpers ───────────────────────────────────────────────

const createCategory = async (overrides: Record<string, unknown> = {}) => {
    const body = { name: 'Food', ...overrides };
    const result = await createCategoryHandler(buildEvent({ body })) as any;
    if (result.statusCode !== 201) throw new Error(`createCategory failed: ${result.statusCode} — ${result.body}`);
    return JSON.parse(result.body).data;
};

const seedTransactionForCategory = async (categoryId: string) => {
    // Seed a minimal GSI1 item so deleteCategory sees an active transaction
    await testDocClient.send(new PutCommand({
        TableName: TEST_TABLE_NAME,
        Item: {
            PK: `USER#${TEST_USER_ID}`,
            SK: `TXN#2025-06-01#fake-txn`,
            GSI1PK: `USER#${TEST_USER_ID}#CAT#${categoryId}`,
            GSI1SK: `TXN#2025-06-01#fake-txn`,
            transactionId: 'fake-txn',
            userId: TEST_USER_ID,
            categoryId,
            type: 'DEBIT',
            amount: 100,
            date: '2025-06-01'
        }
    }));
};

beforeAll(async () => { await setupIntegration(); });
afterAll(async () => { await teardownIntegration(); });
beforeEach(async () => { await clearTable(); });

// =========================================================
// POST /categories
// =========================================================
describe('POST /categories — integration', () => {
    it('creates category and returns 201 with correct fields', async () => {
        const cat = await createCategory({ name: 'Food', icon: '🍔', color: '#FF6B6B' });
        expect(cat.categoryId).toMatch(/^cat_/);
        expect(cat.name).toBe('Food');
        expect(cat.icon).toBe('🍔');
        expect(cat.color).toBe('#FF6B6B');
        expect(cat.userId).toBe(TEST_USER_ID);
        expect(cat.createdAt).toBeDefined();
        expect(cat.updatedAt).toBeDefined();
    });

    it('writes item to DynamoDB with correct PK/SK', async () => {
        const cat = await createCategory({ name: 'Transport' });
        const item = await testDocClient.send(new GetCommand({
            TableName: TEST_TABLE_NAME,
            Key: { PK: `USER#${TEST_USER_ID}`, SK: `CATEGORY#${cat.categoryId}` }
        }));
        expect(item.Item).toBeDefined();
        expect(item.Item?.name).toBe('Transport');
        expect(item.Item?.categoryId).toBe(cat.categoryId);
    });

    it('strips PK and SK from response', async () => {
        const cat = await createCategory();
        expect(cat.PK).toBeUndefined();
        expect(cat.SK).toBeUndefined();
    });

    it('trims whitespace from name', async () => {
        const cat = await createCategory({ name: '  Groceries  ' });
        expect(cat.name).toBe('Groceries');
    });

    it('works without optional icon and color', async () => {
        const cat = await createCategory({ name: 'Misc' });
        expect(cat.name).toBe('Misc');
        expect(cat.icon).toBeUndefined();
        expect(cat.color).toBeUndefined();
    });

    it('generates unique categoryId per category', async () => {
        const cat1 = await createCategory({ name: 'Cat1' });
        const cat2 = await createCategory({ name: 'Cat2' });
        expect(cat1.categoryId).not.toBe(cat2.categoryId);
    });

    it('returns 400 when name is missing', async () => {
        const result = await createCategoryHandler(buildEvent({ body: { icon: '🍔' } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await createCategoryHandler(buildEvent({ body: { name: 'Food' } })) as any;
        expect(result.statusCode).toBe(401);
    });
});

// =========================================================
// GET /categories
// =========================================================
describe('GET /categories — integration', () => {
    it('returns empty array when no categories exist', async () => {
        const result = await getCategoriesHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data).toEqual([]);
    });

    it('returns all categories for the user', async () => {
        await createCategory({ name: 'Food' });
        await createCategory({ name: 'Transport' });
        await createCategory({ name: 'Salary' });

        const result = await getCategoriesHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data).toHaveLength(3);
        const names = data.map((c: any) => c.name).sort();
        expect(names).toEqual(['Food', 'Salary', 'Transport']);
    });

    it('strips PK and SK from each item', async () => {
        await createCategory({ name: 'Food' });
        const result = await getCategoriesHandler(buildEvent()) as any;
        const data = JSON.parse(result.body).data;
        data.forEach((item: any) => {
            expect(item.PK).toBeUndefined();
            expect(item.SK).toBeUndefined();
        });
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await getCategoriesHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(401);
    });
});

// =========================================================
// PUT /categories/{categoryId}
// =========================================================
describe('PUT /categories/{categoryId} — integration', () => {
    it('updates name and returns updated category', async () => {
        const cat = await createCategory({ name: 'Food' });
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: { name: 'Groceries' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.name).toBe('Groceries');
        expect(data.categoryId).toBe(cat.categoryId);
    });

    it('updates icon only — other fields unchanged', async () => {
        const cat = await createCategory({ name: 'Food', icon: '🍔', color: '#FF6B6B' });
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: { icon: '🥗' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.icon).toBe('🥗');
        expect(data.name).toBe('Food');
        expect(data.color).toBe('#FF6B6B');
    });

    it('updates color only', async () => {
        const cat = await createCategory({ name: 'Food', color: '#FF6B6B' });
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: { color: '#00FF00' }
        })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.color).toBe('#00FF00');
    });

    it('persists changes to DynamoDB', async () => {
        const cat = await createCategory({ name: 'Food' });
        await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: { name: 'Updated Food' }
        }));
        const item = await testDocClient.send(new GetCommand({
            TableName: TEST_TABLE_NAME,
            Key: { PK: `USER#${TEST_USER_ID}`, SK: `CATEGORY#${cat.categoryId}` }
        }));
        expect(item.Item?.name).toBe('Updated Food');
    });

    it('updates updatedAt on every call', async () => {
        const cat = await createCategory({ name: 'Food' });
        const originalUpdatedAt = cat.updatedAt;
        await new Promise(r => setTimeout(r, 10));
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: { name: 'New Name' }
        })) as any;
        expect(JSON.parse(result.body).data.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('strips PK and SK from response', async () => {
        const cat = await createCategory();
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: { name: 'Updated' }
        })) as any;
        const data = JSON.parse(result.body).data;
        expect(data.PK).toBeUndefined();
        expect(data.SK).toBeUndefined();
    });

    it('returns 404 for non-existent categoryId', async () => {
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: 'cat_nonexistent' },
            body: { name: 'Updated' }
        })) as any;
        expect(result.statusCode).toBe(404);
    });

    it('returns 400 when body is empty', async () => {
        const cat = await createCategory();
        const result = await updateCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId },
            body: {}
        })) as any;
        expect(result.statusCode).toBe(400);
    });
});

// =========================================================
// DELETE /categories/{categoryId}
// =========================================================
describe('DELETE /categories/{categoryId} — integration', () => {
    it('deletes category and returns confirmation', async () => {
        const cat = await createCategory({ name: 'Food' });
        const result = await deleteCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId }
        })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.categoryId).toBe(cat.categoryId);
        expect(data.deleted).toBe(true);
    });

    it('removes item from DynamoDB', async () => {
        const cat = await createCategory({ name: 'Food' });
        await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: cat.categoryId } }));
        const item = await testDocClient.send(new GetCommand({
            TableName: TEST_TABLE_NAME,
            Key: { PK: `USER#${TEST_USER_ID}`, SK: `CATEGORY#${cat.categoryId}` }
        }));
        expect(item.Item).toBeUndefined();
    });

    it('returns 404 for non-existent categoryId', async () => {
        const result = await deleteCategoryHandler(buildEvent({
            pathParameters: { categoryId: 'cat_nonexistent' }
        })) as any;
        expect(result.statusCode).toBe(404);
    });

    it('returns 409 when active transactions exist for the category', async () => {
        const cat = await createCategory({ name: 'Food' });
        await seedTransactionForCategory(cat.categoryId);
        const result = await deleteCategoryHandler(buildEvent({
            pathParameters: { categoryId: cat.categoryId }
        })) as any;
        expect(result.statusCode).toBe(409);
        expect(JSON.parse(result.body).message).toMatch(/transaction/i);
    });

    it('does not affect other categories', async () => {
        const cat1 = await createCategory({ name: 'Food' });
        const cat2 = await createCategory({ name: 'Transport' });
        await deleteCategoryHandler(buildEvent({ pathParameters: { categoryId: cat1.categoryId } }));

        const item = await testDocClient.send(new GetCommand({
            TableName: TEST_TABLE_NAME,
            Key: { PK: `USER#${TEST_USER_ID}`, SK: `CATEGORY#${cat2.categoryId}` }
        }));
        expect(item.Item).toBeDefined();
        expect(item.Item?.name).toBe('Transport');
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await deleteCategoryHandler(buildEvent({
            pathParameters: { categoryId: 'cat_any' }
        })) as any;
        expect(result.statusCode).toBe(401);
    });
});