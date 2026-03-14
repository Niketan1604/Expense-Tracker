import axios, { AxiosRequestConfig } from 'axios'
import { getIdToken } from './auth'
import type {
  Transaction, Category, Budget, UserProfile,
  MonthlyTotal, MonthlySummary, MonthlyTrendItem,
  CreateTransactionBody, UpdateTransactionBody,
  CreateCategoryBody, UpdateCategoryBody,
  SetBudgetBody, UpdateProfileBody,
  GetTransactionsParams, GetBudgetsParams,
  GetTopCategoriesParams, GetTrendParams, TransactionType,
} from '@/types'

const client = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_ENDPOINT })

// Auto-inject JWT
client.interceptors.request.use(async (config) => {
  const token = await getIdToken()
  config.headers.Authorization = `Bearer ${token}`
  return config
})

// Unwrap { data: <payload> } envelope + normalise errors
client.interceptors.response.use(
  (res) => {
    if (res.data && 'data' in res.data) res.data = res.data.data
    return res
  },
  (err) => Promise.reject(new Error(err.response?.data?.message ?? err.message ?? 'Unknown error'))
)

function qp(obj: Record<string, unknown> | object): AxiosRequestConfig {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj))
    if (v != null && v !== '') clean[k] = String(v)
  return { params: clean }
}

// ── User ──────────────────────────────────────────────────────────────────────
export const userApi = {
  getProfile:    ()                    => client.get<UserProfile>('/user/profile').then(r => r.data),
  updateProfile: (body: UpdateProfileBody) => client.put<UserProfile>('/user/profile', body).then(r => r.data),
}

// ── Transactions ──────────────────────────────────────────────────────────────
export const transactionsApi = {
  list:   (p: GetTransactionsParams)              => client.get<Transaction[]>('/transactions', qp(p)).then(r => r.data),
  get:    (id: string)                            => client.get<Transaction>(`/transactions/${id}`).then(r => r.data),
  create: (body: CreateTransactionBody)           => client.post<Transaction>('/transactions', body).then(r => r.data),
  update: (id: string, body: UpdateTransactionBody) => client.put<Transaction>(`/transactions/${id}`, body).then(r => r.data),
  delete: (id: string)                            => client.delete(`/transactions/${id}`).then(r => r.data),
}

// ── Categories ────────────────────────────────────────────────────────────────
export const categoriesApi = {
  list:   ()                                          => client.get<Category[]>('/categories').then(r => r.data),
  create: (body: CreateCategoryBody)                 => client.post<Category>('/categories', body).then(r => r.data),
  update: (id: string, body: UpdateCategoryBody)     => client.put<Category>(`/categories/${id}`, body).then(r => r.data),
  delete: (id: string)                               => client.delete(`/categories/${id}`).then(r => r.data),
}

// ── Budgets ───────────────────────────────────────────────────────────────────
export const budgetsApi = {
  list:   (p?: GetBudgetsParams) => client.get<Budget[]>('/budgets', p ? qp(p) : undefined).then(r => r.data),
  set:    (body: SetBudgetBody)  => client.post<Budget>('/budgets', body).then(r => r.data),
  // month is a QUERY PARAM per backend contract
  delete: (categoryId: string, month: string) => client.delete(`/budgets/${categoryId}`, qp({ month })).then(r => r.data),
}

// ── Summary / Analytics ───────────────────────────────────────────────────────
export const summaryApi = {
  getMonthlyTotal: (month: string) =>
    client.get<MonthlyTotal>('/summary', qp({ month })).then(r => r.data),

  getBreakdown: (month: string) =>
    client.get<{ month: string; breakdown: MonthlySummary[] }>('/summary/breakdown', qp({ month }))
      .then(r => r.data),

  getTopCategories: (p: GetTopCategoriesParams) =>
    client.get<{ month: string; type: TransactionType | undefined; limit: number; topCategories: MonthlySummary[] }>(
      '/summary/top-categories', qp(p)
    ).then(r => r.data),

  getTrend: (p?: GetTrendParams) =>
    client.get<{ months: number; trend: MonthlyTrendItem[] }>(
      '/summary/trend', p ? qp(p) : undefined
    ).then(r => r.data),
}
