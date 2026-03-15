// ============================================================
// BRANCH COVERAGE PATCHES
// Targets every uncovered branch from the coverage report.
// Drop this file at: test/unit/coverage-branches.test.ts
// ============================================================

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
    DynamoDBDocumentClient,
    QueryCommand,
    GetCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
    BatchGetCommand,
    TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';

// ── Mock setup ────────────────────────────────────────────────
const ddbMock = mockClient(DynamoDBDocumentClient);

jest.mock('../../src/shared/db', () => {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    return { docClient: DynamoDBDocumentClient.from(new DynamoDBClient({})), TABLE_NAME: 'test-table' };
});
jest.mock('../../src/shared/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));
jest.mock('../../src/shared/auth', () => ({
    getUserId: jest.fn().mockReturnValue('user-123'),
    getUserEmail: jest.fn().mockReturnValue('test@flowmint.dev')
}));

import { buildEvent } from '../helpers/eventBuilder';

const TEST_USER_ID = 'user-123';

beforeEach(() => { ddbMock.reset(); });

// ============================================================
// src/budget/getBudgets — L52: skPrefix without month (no-month path)
// ============================================================
describe('getBudgets — branch: no month filter (all budgets)', () => {
    it('queries with BUDGET# prefix when month is not provided', async () => {
        const { handler } = await import('../../src/budget/getBudgets/index');
        ddbMock.on(QueryCommand).resolves({ Items: [] });

        const result = await handler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);

        const call = ddbMock.commandCalls(QueryCommand)[0]!;
        expect(call.args[0].input.ExpressionAttributeValues![':prefix']).toBe('BUDGET#');
    });

    it('queries with BUDGET#yyyy#mm# prefix when month is provided', async () => {
        const { handler } = await import('../../src/budget/getBudgets/index');
        ddbMock.on(QueryCommand).resolves({ Items: [] });

        await handler(buildEvent({ queryStringParameters: { month: '2025-06' } }));

        const call = ddbMock.commandCalls(QueryCommand)[0]!;
        expect(call.args[0].input.ExpressionAttributeValues![':prefix']).toBe('BUDGET#2025#06#');
    });
});

// ============================================================
// src/category/deleteCategory — L45: txnCheck.Count nullish (Count=0 path)
// ============================================================
describe('deleteCategory — branch: Count nullish coalescing', () => {
    it('proceeds with delete when Count is undefined (treated as 0)', async () => {
        const { handler } = await import('../../src/category/deleteCategory/index');
        ddbMock.on(QueryCommand).resolves({ Count: undefined }); // ?? 0 branch
        ddbMock.on(DeleteCommand).resolves({});

        const result = await handler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
        expect(result.statusCode).toBe(200);
    });

    it('returns 409 when Count is 1', async () => {
        const { handler } = await import('../../src/category/deleteCategory/index');
        ddbMock.on(QueryCommand).resolves({ Count: 1 });

        const result = await handler(buildEvent({ pathParameters: { categoryId: 'cat_abc' } })) as any;
        expect(result.statusCode).toBe(409);
    });
});

// ============================================================
// src/category/getCategories — L33: result.Items nullish (Items=undefined)
// ============================================================
describe('getCategories — branch: Items nullish coalescing', () => {
    it('returns empty array when Items is undefined', async () => {
        const { handler } = await import('../../src/category/getCategories/index');
        ddbMock.on(QueryCommand).resolves({ Items: undefined });

        const result = await handler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data).toEqual([]);
    });
});

// ============================================================
// src/category/updateCategory — L29: body with no name (ExpressionAttributeNames empty)
// ============================================================
describe('updateCategory — branch: ExpressionAttributeNames absent when name not updated', () => {
    it('omits ExpressionAttributeNames when only icon is updated', async () => {
        const { handler } = await import('../../src/category/updateCategory/index');
        ddbMock.on(UpdateCommand).resolves({
            Attributes: {
                PK: 'USER#user-123', SK: 'CATEGORY#cat_abc',
                categoryId: 'cat_abc', userId: 'user-123',
                icon: '🏠', color: '#aaa', name: 'Old', createdAt: 'x', updatedAt: 'y'
            }
        });

        const result = await handler(buildEvent({
            pathParameters: { categoryId: 'cat_abc' },
            body: { icon: '🏠' }
        })) as any;

        expect(result.statusCode).toBe(200);
        const call = ddbMock.commandCalls(UpdateCommand)[0];
        // ExpressionAttributeNames must NOT be present when name is not updated
        expect(call.args[0].input.ExpressionAttributeNames).toBeUndefined();
    });

    it('includes ExpressionAttributeNames when name is updated', async () => {
        const { handler } = await import('../../src/category/updateCategory/index');
        ddbMock.on(UpdateCommand).resolves({
            Attributes: {
                PK: 'USER#user-123', SK: 'CATEGORY#cat_abc',
                categoryId: 'cat_abc', userId: 'user-123',
                icon: '🏠', color: '#aaa', name: 'New', createdAt: 'x', updatedAt: 'y'
            }
        });

        await handler(buildEvent({
            pathParameters: { categoryId: 'cat_abc' },
            body: { name: 'New Name' }
        }));

        const call = ddbMock.commandCalls(UpdateCommand)[0];
        expect(call.args[0].input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
    });
});

// ============================================================
// src/summary/getTopCategories — L55,59-60: filter branches
//   type=DEBIT  → items with totalDebit=0 filtered out
//   type=CREDIT → items with totalCredit=0 filtered out
//   no type     → all items pass filter
// ============================================================
describe('getTopCategories — branch: filter by type', () => {
    const makeItem = (categoryId: string, totalDebit: number, totalCredit: number) => ({
        PK: `USER#${TEST_USER_ID}`, SK: `SUMMARY#2025#06#${categoryId}`,
        categoryId, totalDebit, totalCredit, netBalance: totalCredit - totalDebit, txnCount: 1
    });

    beforeEach(() => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                makeItem('cat_food', 50000, 0),
                makeItem('cat_salary', 0, 4500000),
                makeItem('cat_mixed', 10000, 5000)
            ]
        });
    });

    it('type=DEBIT filters out zero-debit items', async () => {
        const { handler } = await import('../../src/summary/getTopCategories/index');
        const result = await handler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'DEBIT' }
        })) as any;
        const { topCategories } = JSON.parse(result.body).data;
        // cat_salary has totalDebit=0 so filtered; cat_food and cat_mixed remain
        expect(topCategories.map((c: any) => c.categoryId)).not.toContain('cat_salary');
        expect(topCategories[0].categoryId).toBe('cat_food'); // highest debit
    });

    it('type=CREDIT filters out zero-credit items', async () => {
        const { handler } = await import('../../src/summary/getTopCategories/index');
        const result = await handler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'CREDIT' }
        })) as any;
        const { topCategories } = JSON.parse(result.body).data;
        // cat_food has totalCredit=0 so filtered
        expect(topCategories.map((c: any) => c.categoryId)).not.toContain('cat_food');
        expect(topCategories[0].categoryId).toBe('cat_salary');
    });

    it('no type returns all items sorted by abs netBalance', async () => {
        const { handler } = await import('../../src/summary/getTopCategories/index');
        const result = await handler(buildEvent({
            queryStringParameters: { month: '2025-06' }
        })) as any;
        const { topCategories, type } = JSON.parse(result.body).data;
        expect(type).toBe('ALL');
        expect(topCategories).toHaveLength(3);
        // cat_salary netBalance=4500000 highest
        expect(topCategories[0].categoryId).toBe('cat_salary');
    });

    it('filters out the #ALL item regardless of type', async () => {
        const { handler } = await import('../../src/summary/getTopCategories/index');
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    PK: `USER#${TEST_USER_ID}`, SK: 'SUMMARY#2025#06#ALL',
                    categoryId: 'ALL', totalDebit: 60000, totalCredit: 4500000, netBalance: 4440000, txnCount: 3
                },
                makeItem('cat_food', 50000, 0)
            ]
        });
        const result = await handler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'DEBIT' }
        })) as any;
        const { topCategories } = JSON.parse(result.body).data;
        expect(topCategories.map((c: any) => c.categoryId)).not.toContain('ALL');
    });
});

// ============================================================
// src/summary/getTrend — L67: Responses nullish (no data returned)
// ============================================================
describe('getTrend — branch: Responses nullish / missing TABLE_NAME key', () => {
    it('returns zeroed months when Responses is undefined', async () => {
        const { handler } = await import('../../src/summary/getTrend/index');
        ddbMock.on(BatchGetCommand).resolves({ Responses: undefined });

        const result = await handler(buildEvent({ queryStringParameters: { months: '3' } })) as any;
        expect(result.statusCode).toBe(200);
        const { trend } = JSON.parse(result.body).data;
        trend.forEach((m: any) => {
            expect(m.totalCredit).toBe(0);
            expect(m.txnCount).toBe(0);
        });
    });

    it('returns zeroed months when table key missing from Responses', async () => {
        const { handler } = await import('../../src/summary/getTrend/index');
        ddbMock.on(BatchGetCommand).resolves({ Responses: {} }); // TABLE_NAME key absent

        const result = await handler(buildEvent({ queryStringParameters: { months: '2' } })) as any;
        const { trend } = JSON.parse(result.body).data;
        expect(trend).toHaveLength(2);
        trend.forEach((m: any) => expect(m.txnCount).toBe(0));
    });
});

// ============================================================
// src/transaction/deleteTransaction — L63-64: CREDIT vs DEBIT delta
// ============================================================
describe('deleteTransaction — branch: CREDIT vs DEBIT delta calculation', () => {
    const makeDeleteEvent = (txnId: string) =>
        buildEvent({ pathParameters: { txnId } });

    const mockQueryItem = (type: 'CREDIT' | 'DEBIT', amount: number, txnId: string) => {
        ddbMock.on(QueryCommand).resolves({
            Items: [{
                PK: `USER#${TEST_USER_ID}`, SK: `TXN#2025-06-01#${txnId}`,
                transactionId: txnId,
                userId: TEST_USER_ID, type, amount, date: '2025-06-01', categoryId: 'cat_food'
            }]
        });
        ddbMock.on(TransactWriteCommand).resolves({});
    };

    it('CREDIT delete: creditDelta=-amount, debitDelta=0', async () => {
        const { handler } = await import('../../src/transaction/deleteTransaction/index');
        mockQueryItem('CREDIT', 4500000, 'credit-txn');

        const result = await handler(makeDeleteEvent('credit-txn')) as any;
        expect(result.statusCode).toBe(200);

        const call = ddbMock.commandCalls(TransactWriteCommand)[0]!;
        const summaryUpdate = call.args[0].input.TransactItems!.find(
            (i: any) => i.Update?.UpdateExpression?.includes('ADD')
        )!;
        const vals = summaryUpdate.Update!.ExpressionAttributeValues!;
        expect(vals[':cd']).toBe(-4500000); // creditDelta = -amount
        expect(vals[':dd']).toBe(0);         // debitDelta  = 0
    });

    it('DEBIT delete: creditDelta=0, debitDelta=-amount', async () => {
        const { handler } = await import('../../src/transaction/deleteTransaction/index');
        mockQueryItem('DEBIT', 50000, 'debit-txn');

        const result = await handler(makeDeleteEvent('debit-txn')) as any;
        expect(result.statusCode).toBe(200);

        const call = ddbMock.commandCalls(TransactWriteCommand)[0]!;
        const summaryUpdate = call.args[0].input.TransactItems!.find(
            (i: any) => i.Update?.UpdateExpression?.includes('ADD')
        )!;
        const vals = summaryUpdate.Update!.ExpressionAttributeValues!;
        expect(vals[':cd']).toBe(0);         // creditDelta = 0
        expect(vals[':dd']).toBe(-50000);    // debitDelta  = -amount
    });
});

// ============================================================
// src/transaction/getTransactions — L58-65,78-90:
//   - categoryId only (GSI1, no type filter)
//   - categoryId + type (GSI1 + FilterExpression)
//   - type only (GSI2)
//   - neither (main table)
// ============================================================
describe('getTransactions — branch: query path selection', () => {
    const ITEMS = [{ PK: 'x', SK: 'y', transactionId: 't1', type: 'DEBIT', amount: 100 }];

    it('categoryId only → GSI1 without FilterExpression', async () => {
        const { handler } = await import('../../src/transaction/getTransactions/index');
        ddbMock.on(QueryCommand).resolves({ Items: ITEMS });

        const result = await handler(buildEvent({
            queryStringParameters: { month: '2025-06', categoryId: 'cat_food' }
        })) as any;
        expect(result.statusCode).toBe(200);

        const call = ddbMock.commandCalls(QueryCommand)[0];
        expect(call.args[0].input.IndexName).toBe('GSI1');
        expect(call.args[0].input.FilterExpression).toBeUndefined();
    });

    it('categoryId + type → GSI1 with FilterExpression', async () => {
        const { handler } = await import('../../src/transaction/getTransactions/index');
        ddbMock.on(QueryCommand).resolves({ Items: ITEMS });

        await handler(buildEvent({
            queryStringParameters: { month: '2025-06', categoryId: 'cat_food', type: 'DEBIT' }
        }));

        const call = ddbMock.commandCalls(QueryCommand)[0];
        expect(call.args[0].input.IndexName).toBe('GSI1');
        expect(call.args[0].input.FilterExpression).toBe('#type = :type');
        expect(call.args[0].input.ExpressionAttributeNames).toEqual({ '#type': 'type' });
    });

    it('type only → GSI2', async () => {
        const { handler } = await import('../../src/transaction/getTransactions/index');
        ddbMock.on(QueryCommand).resolves({ Items: ITEMS });

        await handler(buildEvent({
            queryStringParameters: { month: '2025-06', type: 'CREDIT' }
        }));

        const call = ddbMock.commandCalls(QueryCommand)[0];
        expect(call.args[0].input.IndexName).toBe('GSI2');
    });

    it('no categoryId or type → main table', async () => {
        const { handler } = await import('../../src/transaction/getTransactions/index');
        ddbMock.on(QueryCommand).resolves({ Items: ITEMS });

        await handler(buildEvent({ queryStringParameters: { month: '2025-06' } }));

        const call = ddbMock.commandCalls(QueryCommand)[0];
        expect(call.args[0].input.IndexName).toBeUndefined();
        expect(call.args[0].input.KeyConditionExpression).toContain('begins_with(SK');
    });

    it('Items nullish → returns empty array', async () => {
        const { handler } = await import('../../src/transaction/getTransactions/index');
        ddbMock.on(QueryCommand).resolves({ Items: undefined });

        const result = await handler(buildEvent({ queryStringParameters: { month: '2025-06' } })) as any;
        expect(JSON.parse(result.body).data).toEqual([]);
    });
});

// ============================================================
// src/transaction/updateTransaction — L186: sameMonthDateChange
// branch where creditDiff=0 AND debitDiff=0 (no summary update)
// ============================================================
describe('updateTransaction — branch: sameMonthDateChange with no amount/type change', () => {
    it('skips category summary update when only date changes within same month (no diff)', async () => {
        const { handler } = await import('../../src/transaction/updateTransaction/index');
        // updateTransaction also uses QueryCommand to find by txnId
        ddbMock.on(QueryCommand).resolves({
            Items: [{
                PK: `USER#${TEST_USER_ID}`, SK: 'TXN#2025-06-01#txn-abc',
                transactionId: 'txn-abc', userId: TEST_USER_ID,
                type: 'DEBIT', amount: 50000, date: '2025-06-01',
                categoryId: 'cat_food', description: 'lunch', createdAt: 'x'
            }]
        });
        ddbMock.on(TransactWriteCommand).resolves({});

        // Same type, same amount, same category, different date but same month
        const result = await handler(buildEvent({
            pathParameters: { txnId: 'txn-abc' },
            body: {
                type: 'DEBIT', amount: 50000, date: '2025-06-15',
                categoryId: 'cat_food', description: 'lunch'
            }
        })) as any;

        expect(result.statusCode).toBe(200);
        const call = ddbMock.commandCalls(TransactWriteCommand)[0]!;
        const items = call.args[0].input.TransactItems!;
        // Should NOT include a category summary update (creditDiff=0, debitDiff=0)
        const summaryUpdates = items.filter((i: any) =>
            i.Update?.Key?.SK?.startsWith?.('SUMMARY#')
        );
        expect(summaryUpdates).toHaveLength(0);
    });
});

// ============================================================
// src/shared/validation — L52: parseBody with null/undefined body
// ============================================================
describe('shared/validation — branch: parseBody null body', () => {
    it('returns 400 when body is null (via any handler that uses parseBody)', async () => {
        const { handler } = await import('../../src/category/createCategory/index');
        const event = buildEvent();
        (event as any).body = null;
        const result = await handler(event) as any;
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toMatch(/required/i);
    });

    it('returns 400 when body is undefined', async () => {
        const { handler } = await import('../../src/category/createCategory/index');
        const event = buildEvent();
        (event as any).body = undefined;
        const result = await handler(event) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
        const { handler } = await import('../../src/category/createCategory/index');
        const event = buildEvent();
        (event as any).body = '{not-valid-json';
        const result = await handler(event) as any;
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toMatch(/json/i);
    });
});

// ============================================================
// src/summary/model — L45-46: summarySK and monthlyTotalSK
// (functions not called directly in existing tests)
// ============================================================
describe('summary/model — branch: key helper functions', () => {
    it('summarySK produces correct format', async () => {
        const { summarySK } = await import('../../src/summary/model');
        expect(summarySK('2025-06', 'cat_food')).toBe('SUMMARY#2025#06#cat_food');
    });

    it('monthlyTotalSK produces correct format', async () => {
        const { monthlyTotalSK } = await import('../../src/summary/model');
        expect(monthlyTotalSK('2025-06')).toBe('SUMMARY#2025#06#ALL');
    });

    it('computeSavingsRate returns 0 when totalCredit is 0', async () => {
        const { computeSavingsRate } = await import('../../src/summary/model');
        expect(computeSavingsRate(0, 0)).toBe(0);
        expect(computeSavingsRate(-5000, 0)).toBe(0);
    });

    it('computeSavingsRate calculates correctly when totalCredit > 0', async () => {
        const { computeSavingsRate } = await import('../../src/summary/model');
        expect(computeSavingsRate(4438000, 4500000)).toBeCloseTo(98.62, 1);
        expect(computeSavingsRate(-50000, 100000)).toBe(-50);
    });
});

// ============================================================
// src/user/putUserProfile — L31-38: event.body null/undefined (XSS skip)
// + email nullish coalescing (?? '')
// ============================================================
describe('putUserProfile — branch: body null and email nullish', () => {
    it('handles missing body gracefully (no XSS applied, empty JSON used)', async () => {
        const { handler } = await import('../../src/user/putUserProfile/index');
        // No body set — falls through to JSON.parse('{}') → missing fields → 400
        const result = await handler(buildEvent()) as any;
        expect(result.statusCode).toBe(400); // name required
    });

    it('email nullish coalescing: uses empty string when getUserEmail returns null', async () => {
        const { handler } = await import('../../src/user/putUserProfile/index');
        const { getUserEmail } = require('../../src/shared/auth');
        (getUserEmail as jest.Mock).mockReturnValueOnce(null); // ?? '' branch

        ddbMock.on(GetCommand).resolves({ Item: undefined });
        ddbMock.on(PutCommand).resolves({});

        const result = await handler(buildEvent({
            body: { name: 'Niketan', currency: 'INR' }
        })) as any;

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).data.email).toBe('');
    });
});