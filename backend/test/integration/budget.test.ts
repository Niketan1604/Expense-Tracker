import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
    setupIntegration, teardownIntegration, clearTable,
    testDocClient, TEST_TABLE_NAME
} from '../helpers/integrationSetup';
import { buildEvent, TEST_USER_ID } from '../helpers/eventBuilder';
import { handler as setBudgetHandler } from '../../src/budget/setBudget/index';
import { handler as getBudgetsHandler } from '../../src/budget/getBudgets/index';
import { handler as deleteBudgetHandler } from '../../src/budget/deleteBudget/index';

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

const setBudget = async (body: Record<string, unknown>, expectStatus = 201) => {
    const result = await setBudgetHandler(buildEvent({ body })) as any;
    if (result.statusCode !== expectStatus) {
        throw new Error(`setBudget failed: ${result.statusCode} — ${result.body}`);
    }
    return JSON.parse(result.body).data;
};

const getBudgetItem = async (month: string, categoryId: string) => {
    const [year, mm] = month.split('-');
    const result = await testDocClient.send(new GetCommand({
        TableName: TEST_TABLE_NAME,
        Key: {
            PK: `USER#${TEST_USER_ID}`,
            SK: `BUDGET#${year}#${mm}#${categoryId}`
        }
    }));
    return result.Item;
};

beforeAll(async () => { await setupIntegration(); });
afterAll(async () => { await teardownIntegration(); });
beforeEach(async () => { await clearTable(); });

// =========================================================
// POST /budgets — upsert (create)
// =========================================================
describe('POST /budgets — create — integration', () => {
    it('creates budget and returns 201 with correct fields', async () => {
        const budget = await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 });
        expect(budget.categoryId).toBe('cat_food');
        expect(budget.month).toBe('2025-06');
        expect(budget.amount).toBe(500000);
        expect(budget.userId).toBe(TEST_USER_ID);
        expect(budget.createdAt).toBeDefined();
        expect(budget.updatedAt).toBeDefined();
    });

    it('writes item to DynamoDB with correct PK/SK', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 });
        const item = await getBudgetItem('2025-06', 'cat_food');
        expect(item).toBeDefined();
        expect(item?.amount).toBe(500000);
        expect(item?.categoryId).toBe('cat_food');
        expect(item?.month).toBe('2025-06');
    });

    it('strips PK and SK from response', async () => {
        const budget = await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 });
        expect(budget.PK).toBeUndefined();
        expect(budget.SK).toBeUndefined();
    });

    it('can create budgets for different categories in same month', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 });
        await setBudget({ categoryId: 'cat_transport', month: '2025-06', amount: 200000 });

        const food = await getBudgetItem('2025-06', 'cat_food');
        const transport = await getBudgetItem('2025-06', 'cat_transport');
        expect(food?.amount).toBe(500000);
        expect(transport?.amount).toBe(200000);
    });

    it('can create budgets for same category in different months', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 });
        await setBudget({ categoryId: 'cat_food', month: '2025-07', amount: 600000 });

        const june = await getBudgetItem('2025-06', 'cat_food');
        const july = await getBudgetItem('2025-07', 'cat_food');
        expect(june?.amount).toBe(500000);
        expect(july?.amount).toBe(600000);
    });

    it('returns 400 when categoryId is missing', async () => {
        const result = await setBudgetHandler(buildEvent({ body: { month: '2025-06', amount: 500000 } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when month format is wrong', async () => {
        const result = await setBudgetHandler(buildEvent({ body: { categoryId: 'cat_food', month: '06-2025', amount: 500000 } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when amount is zero', async () => {
        const result = await setBudgetHandler(buildEvent({ body: { categoryId: 'cat_food', month: '2025-06', amount: 0 } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when amount is negative', async () => {
        const result = await setBudgetHandler(buildEvent({ body: { categoryId: 'cat_food', month: '2025-06', amount: -100 } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await setBudgetHandler(buildEvent({ body: { categoryId: 'cat_food', month: '2025-06', amount: 500000 } })) as any;
        expect(result.statusCode).toBe(401);
    });
});

// =========================================================
// POST /budgets — upsert (update)
// =========================================================
describe('POST /budgets — update — integration', () => {
    it('returns 200 when budget already exists', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        const result = await setBudgetHandler(buildEvent({
            body: { categoryId: 'cat_food', month: '2025-06', amount: 600000 }
        })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.amount).toBe(600000);
    });

    it('updates amount in DynamoDB on second call', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 750000 }, 200);

        const item = await getBudgetItem('2025-06', 'cat_food');
        expect(item?.amount).toBe(750000);
    });

    it('preserves original createdAt on update', async () => {
        const first = await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        const originalCreatedAt = first.createdAt;

        await new Promise(r => setTimeout(r, 10));
        const second = await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 600000 }, 200);

        expect(second.createdAt).toBe(originalCreatedAt);
    });

    it('updates updatedAt on each call', async () => {
        const first = await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        await new Promise(r => setTimeout(r, 10));
        const second = await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 600000 }, 200);
        expect(second.updatedAt).not.toBe(first.updatedAt);
    });
});

// =========================================================
// GET /budgets
// =========================================================
describe('GET /budgets — integration', () => {
    beforeEach(async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        await setBudget({ categoryId: 'cat_transport', month: '2025-06', amount: 200000 }, 201);
        await setBudget({ categoryId: 'cat_food', month: '2025-07', amount: 600000 }, 201);
    });

    it('returns all budgets when no month filter', async () => {
        const result = await getBudgetsHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data).toHaveLength(3);
    });

    it('filters budgets by month', async () => {
        const result = await getBudgetsHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data).toHaveLength(2);
        data.forEach((b: any) => expect(b.month).toBe('2025-06'));
    });

    it('returns only July budget when filtered', async () => {
        const result = await getBudgetsHandler(buildEvent({ queryStringParameters: { month: '2025-07' } })) as any;
        const data = JSON.parse(result.body).data;
        expect(data).toHaveLength(1);
        expect(data[0].categoryId).toBe('cat_food');
        expect(data[0].amount).toBe(600000);
    });

    it('returns empty array for month with no budgets', async () => {
        const result = await getBudgetsHandler(buildEvent({ queryStringParameters: { month: '2025-05' } })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data).toEqual([]);
    });

    it('strips PK and SK from each item', async () => {
        const result = await getBudgetsHandler(buildEvent()) as any;
        const data = JSON.parse(result.body).data;
        data.forEach((item: any) => {
            expect(item.PK).toBeUndefined();
            expect(item.SK).toBeUndefined();
        });
    });

    it('returns 400 for invalid month format', async () => {
        const result = await getBudgetsHandler(buildEvent({ queryStringParameters: { month: '06-2025' } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await getBudgetsHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(401);
    });
});

// =========================================================
// DELETE /budgets/{categoryId}?month=yyyy-mm
// =========================================================
describe('DELETE /budgets/{categoryId} — integration', () => {
    it('deletes budget and returns confirmation', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        const result = await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' },
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.categoryId).toBe('cat_food');
        expect(data.month).toBe('2025-06');
        expect(data.deleted).toBe(true);
    });

    it('removes item from DynamoDB', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' },
            queryStringParameters: { month: '2025-06' }
        }));
        const item = await getBudgetItem('2025-06', 'cat_food');
        expect(item).toBeUndefined();
    });

    it('returns 404 when budget does not exist', async () => {
        const result = await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_nonexistent' },
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(result.statusCode).toBe(404);
    });

    it('only deletes the targeted month — other months untouched', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        await setBudget({ categoryId: 'cat_food', month: '2025-07', amount: 600000 }, 201);

        await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' },
            queryStringParameters: { month: '2025-06' }
        }));

        const june = await getBudgetItem('2025-06', 'cat_food');
        const july = await getBudgetItem('2025-07', 'cat_food');
        expect(june).toBeUndefined();
        expect(july).toBeDefined();
        expect(july?.amount).toBe(600000);
    });

    it('only deletes the targeted category — others untouched', async () => {
        await setBudget({ categoryId: 'cat_food', month: '2025-06', amount: 500000 }, 201);
        await setBudget({ categoryId: 'cat_transport', month: '2025-06', amount: 200000 }, 201);

        await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' },
            queryStringParameters: { month: '2025-06' }
        }));

        const transport = await getBudgetItem('2025-06', 'cat_transport');
        expect(transport).toBeDefined();
        expect(transport?.amount).toBe(200000);
    });

    it('returns 400 when month query param is missing', async () => {
        const result = await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when month format is wrong', async () => {
        const result = await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' },
            queryStringParameters: { month: '06-2025' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await deleteBudgetHandler(buildEvent({
            pathParameters: { categoryId: 'cat_food' },
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(result.statusCode).toBe(401);
    });
});