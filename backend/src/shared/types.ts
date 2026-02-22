// Key helpers
export const Keys = {
  userProfile:  (userId: string) =>
    ({ PK: `USER#${userId}`, SK: 'PROFILE' }),
  category:     (userId: string, categoryId: string) =>
    ({ PK: `USER#${userId}`, SK: `CATEGORY#${categoryId}` }),
  budget:       (userId: string, year: string, month: string, categoryId: string) =>
    ({ PK: `USER#${userId}`, SK: `BUDGET#${year}#${month}#${categoryId}` }),
  expense:      (userId: string, date: string, expenseId: string) =>
    ({ PK: `USER#${userId}`, SK: `EXPENSE#${date}#${expenseId}` }),
  summary:      (userId: string, year: string, month: string, categoryId: string) =>
    ({ PK: `USER#${userId}`, SK: `SUMMARY#${year}#${month}#${categoryId}` }),
  summaryAll:   (userId: string, year: string, month: string) =>
    ({ PK: `USER#${userId}`, SK: `SUMMARY#${year}#${month}#ALL` }),
};

// Entity interfaces — to be expanded during implementation sprint
export interface UserProfile {
  PK: string; SK: string;
  userId: string; email: string; name: string; currency: string;
  createdAt: string; updatedAt: string;
}

export interface Category {
  PK: string; SK: string;
  categoryId: string; userId: string;
  name: string; color: string; icon: string;
  createdAt: string; updatedAt: string;
}

export interface Budget {
  PK: string; SK: string;
  budgetId: string; userId: string; categoryId: string;
  year: string; month: string; amount: number;
  createdAt: string; updatedAt: string;
}

export interface Expense {
  PK: string; SK: string;
  GSI1PK: string; GSI1SK: string;
  expenseId: string; userId: string;
  amount: number; categoryId: string; categoryName: string;
  description: string; date: string;
  createdAt: string; updatedAt: string;
}

export interface MonthlySummary {
  PK: string; SK: string;
  userId: string; categoryId: string; categoryName: string;
  year: string; month: string;
  totalAmount: number; expenseCount: number;
  budgetAmount: number; budgetRemaining: number;
  updatedAt: string;
}