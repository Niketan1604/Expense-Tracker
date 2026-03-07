import { z } from 'zod';
import { amountSchema, monthSchema } from '../shared/validation';

// =========================================================
// Budget Model
//
// A budget is a spending limit for a category in a month.
// One budget per user+category+month combination.
//
// DynamoDB key:
//   PK: USER#{userId}
//   SK: BUDGET#{yyyy}#{mm}#{categoryId}
//
// Amount stored as integer paise/cents — same as transactions.
// =========================================================

export interface Budget {
    userId: string;
    categoryId: string;
    month: string;      // yyyy-mm
    amount: number;     // integer paise/cents
    createdAt: string;
    updatedAt: string;
}

// ── Key builders ──────────────────────────────────────────

export const budgetPK = (userId: string) =>
    `USER#${userId}`;

export const budgetSK = (month: string, categoryId: string) => {
    const [year, mm] = month.split('-');
    return `BUDGET#${year}#${mm}#${categoryId}`;
};

export const budgetKey = (userId: string, month: string, categoryId: string) => ({
    PK: budgetPK(userId),
    SK: budgetSK(month, categoryId)
});

// ── Zod schemas ───────────────────────────────────────────

export const createBudgetSchema = z.object({
    categoryId: z.string().min(1, 'categoryId is required'),
    month: monthSchema,
    amount: amountSchema
});

export const updateBudgetSchema = z.object({
    amount: amountSchema
});

export type CreateBudgetBody = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetBody = z.infer<typeof updateBudgetSchema>;