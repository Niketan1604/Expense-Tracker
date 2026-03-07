import { z } from 'zod';
import { monthSchema } from '../shared/validation';

// =========================================================
// Summary Model
//
// Summary items are pre-computed on every transaction write.
// Analytics endpoints read these — never scan raw transactions.
//
// MonthlySummary — per category per month
//   SK: SUMMARY#{yyyy}#{mm}#{categoryId}
//
// MonthlyTotal — all categories combined per month
//   SK: SUMMARY#{yyyy}#{mm}#ALL
// =========================================================

export interface MonthlySummary {
    userId: string;
    categoryId: string;
    month: string;        // yyyy-mm (derived from SK)
    totalCredit: number;
    totalDebit: number;
    netBalance: number;
    txnCount: number;
    updatedAt: string;
}

export interface MonthlyTotal {
    userId: string;
    month: string;
    totalCredit: number;
    totalDebit: number;
    netBalance: number;
    savingsRate: number;  // netBalance / totalCredit * 100
    txnCount: number;
    updatedAt: string;
}

// ── Key builders ──────────────────────────────────────────

export const summaryPK = (userId: string) =>
    `USER#${userId}`;

export const summarySK = (month: string, categoryId: string) => {
    const [year, mm] = month.split('-');
    return `SUMMARY#${year}#${mm}#${categoryId}`;
};

export const monthlyTotalSK = (month: string) => {
    const [year, mm] = month.split('-');
    return `SUMMARY#${year}#${mm}#ALL`;
};

export const monthlyTotalKey = (userId: string, month: string) => ({
    PK: summaryPK(userId),
    SK: monthlyTotalSK(month)
});

// ── Compute savingsRate ───────────────────────────────────
// Avoid division by zero when totalCredit is 0

export const computeSavingsRate = (netBalance: number, totalCredit: number): number => {
    if (totalCredit === 0) return 0;
    return Math.round((netBalance / totalCredit) * 10000) / 100; // 2 decimal places
};

// ── Query param schemas ───────────────────────────────────

export const summaryQuerySchema = z.object({
    month: monthSchema
});

export const trendQuerySchema = z.object({
    months: z.string()
        .optional()
        .transform(v => parseInt(v ?? '6', 10))
        .pipe(z.number().int().min(1).max(12))
});