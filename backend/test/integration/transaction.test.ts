import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
    setupIntegration,
    teardownIntegration,
    clearTable,
    testDocClient,
    TEST_TABLE_NAME
} from '../helpers/integrationSetup';
import { buildEvent, TEST_USER_ID } from '../helpers/eventBuilder';
import { handler as createHandler } from '../../src/transaction/createTransaction/index';
import { handler as getListHandler } from '../../src/transaction/getTransactions/index';
import { handler as getOneHandler } from '../../src/transaction/getTransaction/index';
import { handler as updateHandler } from '../../src/transaction/updateTransaction/index';
import { handler as deleteHandler } from '../../src/transaction/deleteTransaction/index';

// =========================================================
// Integration Tests — Transactions
//
// Requires DynamoDB Local running on port 8000:
//   docker run -p 8000:8000 amazon/dynamodb-local
//
// Run with: npm run test:integration
// =========================================================

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
    const result = await createHandler(buildEvent({ body })) as any;
    if (result.statusCode !== 201) {
        throw new Error(`createTxn failed: ${result.statusCode} — ${result.body}`);
    }
    return JSON.parse(result.body).data;
};

const updateTxn = async (txnId: string, updates: Record<string, unknown>) => {
    const result = await updateHandler(buildEvent({
        pathParameters: { txnId },
        body: updates
    })) as any;
    if (result.statusCode !== 200) {
        throw new Error(`updateTxn failed: ${result.statusCode} — ${result.body}`);
    }
    return JSON.parse(result.body).data;
};

const getSummaryItem = async (sk: string) => {
    const result = await testDocClient.send(new GetCommand({
        TableName: TEST_TABLE_NAME,
        Key: { PK: `USER#${TEST_USER_ID}`, SK: sk }
    }));
    return result.Item;
};

const getItem = async (sk: string) => {
    const result = await testDocClient.send(new GetCommand({
        TableName: TEST_TABLE_NAME,
        Key: { PK: `USER#${TEST_USER_ID}`, SK: sk }
    }));
    return result.Item;
};

// ── Lifecycle ─────────────────────────────────────────────

beforeAll(async () => { await setupIntegration(); });
afterAll(async () => { await teardownIntegration(); });
beforeEach(async () => { await clearTable(); });

// =========================================================
// CREATE
// =========================================================
describe('POST /transactions — integration', () => {
    it('writes transaction item to DynamoDB with correct fields', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });

        const item = await getItem(`TXN#${txn.date}#${txn.transactionId}`);
        expect(item).toBeDefined();
        expect(item?.transactionId).toBe(txn.transactionId);
        expect(item?.amount).toBe(50000);
        expect(item?.type).toBe('DEBIT');
        expect(item?.categoryId).toBe('cat_food');
    });

    it('sets GSI1PK and GSI2PK on the transaction item', async () => {
        const txn = await createTxn({ categoryId: 'cat_food', type: 'DEBIT' });

        const item = await getItem(`TXN#${txn.date}#${txn.transactionId}`);
        expect(item?.GSI1PK).toBe(`USER#${TEST_USER_ID}#CAT#cat_food`);
        expect(item?.GSI2PK).toBe(`USER#${TEST_USER_ID}#TYPE#DEBIT`);
    });

    it('creates MonthlySummary for the category', async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });

        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(summary).toBeDefined();
        expect(summary?.totalDebit).toBe(50000);
        expect(summary?.totalCredit).toBe(0);
        expect(summary?.netBalance).toBe(-50000);
        expect(summary?.txnCount).toBe(1);
    });

    it('creates MonthlyTotal across all categories', async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', date: '2025-06-01' });

        const total = await getSummaryItem('SUMMARY#2025#06#ALL');
        expect(total).toBeDefined();
        expect(total?.totalDebit).toBe(50000);
        expect(total?.txnCount).toBe(1);
    });

    it('accumulates summary correctly across multiple transactions', async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await createTxn({ amount: 12000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-03' });
        await createTxn({ amount: 4500000, type: 'CREDIT', categoryId: 'cat_salary', date: '2025-06-05' });

        const total = await getSummaryItem('SUMMARY#2025#06#ALL');
        expect(total?.totalDebit).toBe(62000);
        expect(total?.totalCredit).toBe(4500000);
        expect(total?.netBalance).toBe(4438000);
        expect(total?.txnCount).toBe(3);

        const foodSummary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(foodSummary?.totalDebit).toBe(62000);
        expect(foodSummary?.txnCount).toBe(2);
    });
});

// =========================================================
// GET LIST
// =========================================================
describe('GET /transactions — integration', () => {
    beforeEach(async () => {
        await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await createTxn({ amount: 12000, type: 'DEBIT', categoryId: 'cat_transport', date: '2025-06-03' });
        await createTxn({ amount: 4500000, type: 'CREDIT', categoryId: 'cat_salary', date: '2025-06-05' });
    });

    it('returns all 3 transactions without filter', async () => {
        const result = await getListHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.items).toHaveLength(3);
    });

    it('returns correct transactions for month filter', async () => {
        const result = await getListHandler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.items).toHaveLength(3);
    });

    it('returns empty array for month with no transactions', async () => {
        const result = await getListHandler(buildEvent({ queryStringParameters: { month: '2025-05' } })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.items).toHaveLength(0);
    });

    it('returns only DEBIT transactions via GSI2', async () => {
        const result = await getListHandler(buildEvent({ queryStringParameters: { type: 'DEBIT' } })) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data.items;
        expect(data).toHaveLength(2);
        data.forEach((t: any) => expect(t.type).toBe('DEBIT'));
    });

    it('returns only CREDIT transactions via GSI2', async () => {
        const result = await getListHandler(buildEvent({ queryStringParameters: { type: 'CREDIT' } })) as any;
        const data = JSON.parse(result.body).data.items;
        expect(data).toHaveLength(1);
        expect(data[0].type).toBe('CREDIT');
    });

    it('returns only matching category via GSI1', async () => {
        const result = await getListHandler(buildEvent({ queryStringParameters: { categoryId: 'cat_food' } })) as any;
        const data = JSON.parse(result.body).data.items;
        expect(data).toHaveLength(1);
        expect(data[0].categoryId).toBe('cat_food');
    });
});

// =========================================================
// GET SINGLE
// =========================================================
describe('GET /transactions/{txnId} — integration', () => {
    it('returns the correct transaction by id', async () => {
        const txn = await createTxn();
        const result = await getOneHandler(buildEvent({ pathParameters: { txnId: txn.transactionId } })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.transactionId).toBe(txn.transactionId);
    });

    it('returns 404 for non-existent transactionId', async () => {
        const result = await getOneHandler(buildEvent({ pathParameters: { txnId: 'non-existent-id' } })) as any;
        expect(result.statusCode).toBe(404);
    });
});

// =========================================================
// UPDATE — same date, same category, amount only
// =========================================================
describe('PUT /transactions/{txnId} — amount change — integration', () => {
    it('updates the transaction amount in DynamoDB', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        const updated = await updateTxn(txn.transactionId, { amount: 75000 });

        expect(updated.amount).toBe(75000);
        expect(updated.categoryId).toBe('cat_food');
        expect(updated.date).toBe('2025-06-01');
    });

    it('applies delta to category summary — only the diff, not full replacement', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { amount: 75000 });

        // diff = 75000 - 50000 = +25000
        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(summary?.totalDebit).toBe(75000);
        expect(summary?.netBalance).toBe(-75000);
    });

    it('applies delta to monthly total', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { amount: 75000 });

        const total = await getSummaryItem('SUMMARY#2025#06#ALL');
        expect(total?.totalDebit).toBe(75000);
    });

    it('does NOT update summaries when nothing relevant changes (description only)', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { description: 'Lunch at work' });

        // Summaries should remain unchanged
        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(summary?.totalDebit).toBe(50000);
        expect(summary?.txnCount).toBe(1);
    });

    it('returns 404 for non-existent txnId', async () => {
        const result = await updateHandler(buildEvent({
            pathParameters: { txnId: 'non-existent-id' },
            body: { amount: 75000 }
        })) as any;
        expect(result.statusCode).toBe(404);
    });
});

// =========================================================
// UPDATE — date change
// =========================================================
describe('PUT /transactions/{txnId} — date change — integration', () => {
    it('creates new SK with new date and removes old SK', async () => {
        const txn = await createTxn({ date: '2025-06-01', amount: 50000, type: 'DEBIT', categoryId: 'cat_food' });
        await updateTxn(txn.transactionId, { date: '2025-06-15' });

        // Old SK must be gone
        const oldItem = await getItem(`TXN#2025-06-01#${txn.transactionId}`);
        expect(oldItem).toBeUndefined();

        // New SK must exist
        const newItem = await getItem(`TXN#2025-06-15#${txn.transactionId}`);
        expect(newItem).toBeDefined();
        expect(newItem?.date).toBe('2025-06-15');
        expect(newItem?.transactionId).toBe(txn.transactionId);
    });

    it('reverses old month summary and creates new month summary when month changes', async () => {
        const txn = await createTxn({ date: '2025-06-01', amount: 50000, type: 'DEBIT', categoryId: 'cat_food' });
        await updateTxn(txn.transactionId, { date: '2025-07-01' });

        // June should be reversed
        const juneSummary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(juneSummary?.totalDebit ?? 0).toBe(0);
        expect(juneSummary?.txnCount ?? 0).toBe(0);

        // July should have the transaction
        const julySummary = await getSummaryItem('SUMMARY#2025#07#cat_food');
        expect(julySummary?.totalDebit).toBe(50000);
        expect(julySummary?.txnCount).toBe(1);
    });

    it('reverses old monthly total and applies to new month total when month changes', async () => {
        const txn = await createTxn({ date: '2025-06-01', amount: 50000, type: 'DEBIT' });
        await updateTxn(txn.transactionId, { date: '2025-07-01' });

        const juneTotal = await getSummaryItem('SUMMARY#2025#06#ALL');
        expect(juneTotal?.totalDebit ?? 0).toBe(0);
        expect(juneTotal?.txnCount ?? 0).toBe(0);

        const julyTotal = await getSummaryItem('SUMMARY#2025#07#ALL');
        expect(julyTotal?.totalDebit).toBe(50000);
        expect(julyTotal?.txnCount).toBe(1);
    });

    it('same-month date change (same YYYY-MM) does NOT move between month summaries', async () => {
        const txn = await createTxn({ date: '2025-06-01', amount: 50000, type: 'DEBIT', categoryId: 'cat_food' });
        // Changing day within same month — month summaries unaffected by date logic
        // but SK still changes (date changed = Delete+Put), and dateChanged=true means
        // handler reverses old + applies new to same summary keys → net zero diff on amounts
        // but txnCount goes -1 then +1 = still 1
        await updateTxn(txn.transactionId, { date: '2025-06-15' });

        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(summary?.totalDebit).toBe(50000);   // unchanged
        expect(summary?.txnCount).toBe(1);          // -1 + 1 = 1
    });
});

// =========================================================
// UPDATE — category change
// =========================================================
describe('PUT /transactions/{txnId} — category change — integration', () => {
    it('reverses old category summary and applies to new category summary', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { categoryId: 'cat_groceries' });

        const oldCat = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(oldCat?.totalDebit ?? 0).toBe(0);
        expect(oldCat?.txnCount ?? 0).toBe(0);

        const newCat = await getSummaryItem('SUMMARY#2025#06#cat_groceries');
        expect(newCat?.totalDebit).toBe(50000);
        expect(newCat?.txnCount).toBe(1);
    });

    it('does NOT change monthly total when only category changes (amount unchanged)', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { categoryId: 'cat_groceries' });

        // Monthly total is unchanged — only category bucket moved, not total amount
        const total = await getSummaryItem('SUMMARY#2025#06#ALL');
        expect(total?.totalDebit).toBe(50000);
        expect(total?.txnCount).toBe(1);
    });

    it('updates GSI1PK on transaction item to new category', async () => {
        const txn = await createTxn({ categoryId: 'cat_food', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { categoryId: 'cat_groceries' });

        const item = await getItem(`TXN#2025-06-01#${txn.transactionId}`);
        expect(item?.GSI1PK).toBe(`USER#${TEST_USER_ID}#CAT#cat_groceries`);
        expect(item?.categoryId).toBe('cat_groceries');
    });
});

// =========================================================
// UPDATE — type change (DEBIT → CREDIT)
// =========================================================
describe('PUT /transactions/{txnId} — type change — integration', () => {
    it('reverses DEBIT contribution and applies CREDIT contribution to summaries', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { type: 'CREDIT' });

        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        // Old: totalDebit=50000, netBalance=-50000
        // Diff: creditDiff=+50000, debitDiff=-50000, netDiff=+100000
        // New: totalDebit=0, totalCredit=50000, netBalance=+50000
        expect(summary?.totalDebit).toBe(0);
        expect(summary?.totalCredit).toBe(50000);
        expect(summary?.netBalance).toBe(50000);
    });

    it('updates GSI2PK on transaction item to new type', async () => {
        const txn = await createTxn({ type: 'DEBIT', date: '2025-06-01' });
        await updateTxn(txn.transactionId, { type: 'CREDIT' });

        const item = await getItem(`TXN#2025-06-01#${txn.transactionId}`);
        expect(item?.GSI2PK).toBe(`USER#${TEST_USER_ID}#TYPE#CREDIT`);
    });
});

// =========================================================
// DELETE
// =========================================================
describe('DELETE /transactions/{txnId} — integration', () => {
    it('removes the transaction item from DynamoDB', async () => {
        const txn = await createTxn();
        const result = await deleteHandler(buildEvent({ pathParameters: { txnId: txn.transactionId } })) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.deleted).toBe(true);

        const item = await getItem(`TXN#${txn.date}#${txn.transactionId}`);
        expect(item).toBeUndefined();
    });

    it('reverses MonthlySummary for category on delete', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await deleteHandler(buildEvent({ pathParameters: { txnId: txn.transactionId } }));

        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(summary?.totalDebit ?? 0).toBe(0);
        expect(summary?.txnCount ?? 0).toBe(0);
    });

    it('reverses MonthlyTotal on delete', async () => {
        const txn = await createTxn({ amount: 50000, type: 'DEBIT', date: '2025-06-01' });
        await deleteHandler(buildEvent({ pathParameters: { txnId: txn.transactionId } }));

        const total = await getSummaryItem('SUMMARY#2025#06#ALL');
        expect(total?.totalDebit ?? 0).toBe(0);
        expect(total?.txnCount ?? 0).toBe(0);
    });

    it('returns 404 when transaction does not exist', async () => {
        const result = await deleteHandler(buildEvent({ pathParameters: { txnId: 'non-existent-id' } })) as any;
        expect(result.statusCode).toBe(404);
    });

    it('leaves other transactions in the same month untouched', async () => {
        const txn1 = await createTxn({ amount: 50000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-01' });
        await createTxn({ amount: 30000, type: 'DEBIT', categoryId: 'cat_food', date: '2025-06-10' });

        await deleteHandler(buildEvent({ pathParameters: { txnId: txn1.transactionId } }));

        const summary = await getSummaryItem('SUMMARY#2025#06#cat_food');
        expect(summary?.totalDebit).toBe(30000);
        expect(summary?.txnCount).toBe(1);
    });
});