import { z } from 'zod';
import { amountSchema, dateSchema, transactionTypeSchema } from '../shared/validation';

// =========================================================
// Transaction Model
//
// Central model for all cash flow entries in FlowMint.
// Replaces the old Expense model entirely.
//
// Key design decisions:
//   - type: CREDIT (income) | DEBIT (expense)
//   - amount: stored as integer paise/cents — no float precision
//   - date: yyyy-mm-dd — always zero-padded for correct SK sort
//   - transactionId: UUID v7 — time-sortable, no DB round-trip
//   - userId: always from JWT sub, never from request body
// =========================================================

export type TransactionType = 'CREDIT' | 'DEBIT';

export interface Transaction {
  transactionId: string;
  userId: string;
  type: TransactionType;
  amount: number;         // integer paise/cents
  categoryId: string;
  description?: string;
  date: string;           // yyyy-mm-dd
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
}

// ── DynamoDB key builders ─────────────────────────────────
// PK/SK are always stripped from API responses.
// GSI keys are set on writes only — never returned to clients.

export const transactionPK = (userId: string) =>
  `USER#${userId}`;

export const transactionSK = (date: string, transactionId: string) =>
  `TXN#${date}#${transactionId}`;

export const gsi1PK = (userId: string, categoryId: string) =>
  `USER#${userId}#CAT#${categoryId}`;

export const gsi2PK = (userId: string, type: TransactionType) =>
  `USER#${userId}#TYPE#${type}`;

// ── Summary key builders ──────────────────────────────────
// Used by createTransaction / updateTransaction / deleteTransaction
// to update MonthlySummary and MonthlyTotal atomically.

export const summarySK = (year: string, month: string, categoryId: string) =>
  `SUMMARY#${year}#${month}#${categoryId}`;

export const monthlyTotalSK = (year: string, month: string) =>
  `SUMMARY#${year}#${month}#ALL`;

// ── Date helpers ──────────────────────────────────────────
// Extract year/month from a yyyy-mm-dd date string.
// Used when building summary keys for a transaction's date.

export const getYearMonth = (date: string): { year: string; month: string } => {
  const [year, month] = date.split('-');
  return { year, month };
};

// ── Zod schemas ───────────────────────────────────────────

export const createTransactionSchema = z.object({
  transactionId: z.string().uuid().optional(),
  type: transactionTypeSchema,
  amount: amountSchema,
  categoryId: z.string().min(1, 'categoryId is required'),
  description: z.string().max(500, 'description must be 500 characters or less').optional(),
  date: dateSchema
});

export const updateTransactionSchema = z.object({
  type: transactionTypeSchema.optional(),
  amount: amountSchema.optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  date: dateSchema.optional()
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionSchema>;