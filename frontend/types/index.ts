// ── Domain types (mirror backend DynamoDB schema) ─────────────────────────────

export type TransactionType = 'CREDIT' | 'DEBIT';

export interface Transaction {
  transactionId: string;
  userId: string;
  type: TransactionType;
  amount: number;       // integer paise — divide by 100 to display
  categoryId: string;
  description?: string;
  date: string;         // yyyy-mm-dd
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTransactions {
  items: Transaction[];
  nextCursor: string | null;
}

export interface Category {
  categoryId: string;   // cat_{uuid}
  userId: string;
  name: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  categoryId: string;
  userId: string;
  month: string;        // yyyy-mm
  amount: number;       // integer paise
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlySummary {
  userId: string;
  categoryId: string;
  month: string;
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
  savingsRate: number;
  txnCount: number;
  updatedAt: string;
}

export interface MonthlyTrendItem {
  month: string;
  totalCredit: number;
  totalDebit: number;
  netBalance: number;
  savingsRate: number;
  txnCount: number;
}

// ── Request bodies ─────────────────────────────────────────────────────────────

export interface CreateTransactionBody {
  transactionId?: string;
  type: TransactionType;
  amount: number;       // paise
  categoryId: string;
  date: string;         // yyyy-mm-dd
  description?: string;
}

export interface UpdateTransactionBody {
  type?: TransactionType;
  amount?: number;
  categoryId?: string;
  date?: string;
  description?: string;
}

export interface CreateCategoryBody {
  name: string;
  icon?: string;
  color?: string;
}

export interface UpdateCategoryBody {
  name?: string;
  icon?: string;
  color?: string;
}

export interface SetBudgetBody {
  categoryId: string;
  month: string;
  amount: number;       // paise
}

export interface UpdateProfileBody {
  name: string;
  currency: string;
}

// ── Query param types ──────────────────────────────────────────────────────────

export interface GetTransactionsParams {
  month: string;
  categoryId?: string;
  type?: TransactionType;
  limit?: number;
  cursor?: string;
}

export interface GetBudgetsParams {
  month?: string;
}

export interface GetTopCategoriesParams {
  month: string;
  type?: TransactionType;
  limit?: number;
}

export interface GetTrendParams {
  months?: number;
}
