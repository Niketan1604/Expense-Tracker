import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import {
    setupIntegration, teardownIntegration, clearTable
} from '../helpers/integrationSetup';
import { buildEvent, TEST_USER_ID } from '../helpers/eventBuilder';
import { handler as createTxnHandler } from '../../src/transaction/createTransaction/index';
import { handler as getMonthlySummaryHandler } from '../../src/summary/getMonthlySummary/index';
import { handler as getBreakdownHandler } from '../../src/summary/getBreakdown/index';
import { handler as getTrendHandler } from '../../src/summary/getTrend/index';
import { handler as getTopCategoriesHandler } from '../../src/summary/getTopCategories/index';

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

const createTxn = async (overrides: Record<string, unknown> = {}) => {
    const body = { type: 'DEBIT', amount: 50000, categoryId: 'cat_food', date: '2025-06-01', ...overrides };
    const result = await createTxnHandler(buildEvent({ body })) as any;
    if (result.statusCode !== 201) throw new Error(`createTxn failed: ${result.statusCode} — ${result.body}`);
    return JSON.parse(result.body).data;
};

beforeAll(async () => { await setupIntegration(); });
afterAll(async () => { await teardownIntegration(); });
beforeEach(async () => { await clearTable(); });

// =========================================================
// GET /summary?month=yyyy-mm
// =========================================================
describe('GET /summary — integration', () => {
    it('returns zeroed summary when no transactions exist for the month', async () => {
        const result = await getMonthlySummaryHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.month).toBe('2025-06');
        expect(data.totalCredit).toBe(0);
        expect(data.totalDebit).toBe(0);
        expect(data.netBalance).toBe(0);
        expect(data.savingsRate).toBe(0);
        expect(data.txnCount).toBe(0);
    });

    it('returns accurate summary after transactions are created', async () => {
        await createTxn({ amount: 4500000, type: 'CREDIT', categoryId: 'cat_salary', date: '2025-06-05' });
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await createTxn({ amount: 12000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-10' });

        const result = await getMonthlySummaryHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        const data = JSON.parse(result.body).data;

        expect(data.totalCredit).toBe(4500000);
        expect(data.totalDebit).toBe(62000);
        expect(data.netBalance).toBe(4438000);
        expect(data.txnCount).toBe(3);
        // savingsRate = round(4438000 / 4500000 * 10000) / 100
        expect(data.savingsRate).toBeCloseTo(98.62, 1);
    });

    it('returns savingsRate of 0 when totalCredit is 0', async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', date: '2025-06-01' });
        const result = await getMonthlySummaryHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(JSON.parse(result.body).data.savingsRate).toBe(0);
    });

    it('does not include other months in the summary', async () => {
        await createTxn({ amount: 4500000, type: 'CREDIT', date: '2025-06-01' });
        await createTxn({ amount: 1000000, type: 'CREDIT', date: '2025-07-01' });

        const result = await getMonthlySummaryHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(JSON.parse(result.body).data.txnCount).toBe(1);
        expect(JSON.parse(result.body).data.totalCredit).toBe(4500000);
    });

    it('returns 400 when month is missing', async () => {
        const result = await getMonthlySummaryHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when month format is wrong', async () => {
        const result = await getMonthlySummaryHandler(buildEvent({
            queryStringParameters: { month: '06-2025' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await getMonthlySummaryHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(result.statusCode).toBe(401);
    });
});

// =========================================================
// GET /summary/breakdown?month=yyyy-mm
// =========================================================
describe('GET /summary/breakdown — integration', () => {
    beforeEach(async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await createTxn({ amount: 12000, type: 'DEBIT', categoryId: 'cat_transport', date: '2025-06-03' });
        await createTxn({ amount: 4500000, type: 'CREDIT', categoryId: 'cat_salary', date: '2025-06-05' });
    });

    it('returns per-category breakdown for the month', async () => {
        const result = await getBreakdownHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.month).toBe('2025-06');
        expect(data.breakdown).toHaveLength(3);
    });

    it('breakdown items have correct categoryId and amounts', async () => {
        const result = await getBreakdownHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        const { breakdown } = JSON.parse(result.body).data;
        const food = breakdown.find((b: any) => b.categoryId === 'cat_food');
        expect(food).toBeDefined();
        expect(food.totalDebit).toBe(50000);
        expect(food.totalCredit).toBe(0);
        expect(food.netBalance).toBe(-50000);
        expect(food.txnCount).toBe(1);
    });

    it('excludes the #ALL item from breakdown', async () => {
        const result = await getBreakdownHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        const { breakdown } = JSON.parse(result.body).data;
        // Should have exactly 3 category items, not 4 (3 categories + 1 ALL)
        breakdown.forEach((b: any) => {
            expect(b.categoryId).not.toBe('ALL');
            expect(b.SK).toBeUndefined();
        });
    });

    it('returns empty breakdown for month with no transactions', async () => {
        const result = await getBreakdownHandler(buildEvent({
            queryStringParameters: { month: '2025-05' }
        })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.breakdown).toEqual([]);
    });

    it('strips PK and SK from each breakdown item', async () => {
        const result = await getBreakdownHandler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        JSON.parse(result.body).data.breakdown.forEach((item: any) => {
            expect(item.PK).toBeUndefined();
            expect(item.SK).toBeUndefined();
        });
    });

    it('returns 400 when month is missing', async () => {
        const result = await getBreakdownHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(400);
    });
});

// =========================================================
// GET /summary/top-categories
// =========================================================
describe('GET /summary/top-categories — integration', () => {
    beforeEach(async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await createTxn({ amount: 12000, type: 'DEBIT', categoryId: 'cat_transport', date: '2025-06-03' });
        await createTxn({ amount: 8000, type: 'DEBIT', categoryId: 'cat_bills', date: '2025-06-04' });
        await createTxn({ amount: 4500000, type: 'CREDIT', categoryId: 'cat_salary', date: '2025-06-05' });
    });

    it('returns top DEBIT categories sorted by totalDebit descending', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'DEBIT' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const { topCategories } = JSON.parse(result.body).data;
        // cat_food (50k) > cat_transport (12k) > cat_bills (8k)
        expect(topCategories[0].categoryId).toBe('cat_food');
        expect(topCategories[1].categoryId).toBe('cat_transport');
        expect(topCategories[2].categoryId).toBe('cat_bills');
    });

    it('returns top CREDIT categories sorted by totalCredit descending', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'CREDIT' }
        })) as any;
        const { topCategories } = JSON.parse(result.body).data;
        expect(topCategories[0].categoryId).toBe('cat_salary');
        expect(topCategories[0].totalCredit).toBe(4500000);
    });

    it('respects limit param', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'DEBIT', limit: '2' }
        })) as any;
        expect(JSON.parse(result.body).data.topCategories).toHaveLength(2);
    });

    it('defaults to limit 5', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'DEBIT' }
        })) as any;
        // Only 3 DEBIT categories exist — returns all 3 (less than default limit of 5)
        expect(JSON.parse(result.body).data.topCategories).toHaveLength(3);
        expect(JSON.parse(result.body).data.limit).toBe(5);
    });

    it('returns empty array for month with no data', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { month: '2025-05', type: 'DEBIT' }
        })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.topCategories).toEqual([]);
    });

    it('returns 400 when month is missing', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { type: 'DEBIT' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when limit exceeds 20', async () => {
        const result = await getTopCategoriesHandler(buildEvent({
            queryStringParameters: { month: '2025-06', limit: '21' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });
});

// =========================================================
// GET /summary/trend?months=N
// =========================================================
describe('GET /summary/trend — integration', () => {
    it('returns N months of trend data oldest-first', async () => {
        const result = await getTrendHandler(buildEvent({
            queryStringParameters: { months: '3' }
        })) as any;
        expect(result.statusCode).toBe(200);
        const { trend, months } = JSON.parse(result.body).data;
        expect(months).toBe(3);
        expect(trend).toHaveLength(3);
        // Oldest first
        expect(trend[0].month < trend[1].month).toBe(true);
        expect(trend[1].month < trend[2].month).toBe(true);
    });

    it('defaults to 6 months', async () => {
        const result = await getTrendHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.trend).toHaveLength(6);
    });

    it('fills months with no transactions as zeroed entries', async () => {
        const result = await getTrendHandler(buildEvent({
            queryStringParameters: { months: '3' }
        })) as any;
        const { trend } = JSON.parse(result.body).data;
        trend.forEach((m: any) => {
            expect(m.month).toMatch(/^\d{4}-\d{2}$/);
            expect(typeof m.totalCredit).toBe('number');
            expect(typeof m.totalDebit).toBe('number');
            expect(typeof m.netBalance).toBe('number');
            expect(typeof m.savingsRate).toBe('number');
            expect(typeof m.txnCount).toBe('number');
        });
    });

    it('includes real data for months that have transactions', async () => {
        // Create a transaction in the current month
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentDate = `${currentMonth}-15`;

        await createTxn({ amount: 4500000, type: 'CREDIT', categoryId: 'cat_salary', date: currentDate });
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: currentDate });

        const result = await getTrendHandler(buildEvent({
            queryStringParameters: { months: '3' }
        })) as any;
        const { trend } = JSON.parse(result.body).data;
        const currentEntry = trend.find((m: any) => m.month === currentMonth);
        expect(currentEntry).toBeDefined();
        expect(currentEntry.totalCredit).toBe(4500000);
        expect(currentEntry.totalDebit).toBe(50000);
        expect(currentEntry.txnCount).toBe(2);
    });

    it('returns 400 when months exceeds 12', async () => {
        const result = await getTrendHandler(buildEvent({
            queryStringParameters: { months: '13' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when months is zero', async () => {
        const result = await getTrendHandler(buildEvent({
            queryStringParameters: { months: '0' }
        })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await getTrendHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(401);
    });
});