'use client'
import { useState, useEffect, useCallback } from 'react'
import { transactionsApi, categoriesApi, budgetsApi, summaryApi, userApi } from '@/lib/api'
import { currentMonth } from '@/lib/format'
import type { TransactionType, GetTransactionsParams } from '@/types'

function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData]       = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await fetcher()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { run() }, [run])
  return { data, loading, error, refetch: run }
}

export const useProfile          = ()             => useFetch(() => userApi.getProfile())
export const useCategories       = ()             => useFetch(() => categoriesApi.list())
export const useBudgets          = (month?: string) => useFetch(() => budgetsApi.list(month ? { month } : undefined), [month])
export const useMonthlyTotal     = (month = currentMonth()) => useFetch(() => summaryApi.getMonthlyTotal(month), [month])
export const useTrend            = (months = 6)  => useFetch(async () => (await summaryApi.getTrend({ months })).trend, [months])

export const useTransactions = (p: GetTransactionsParams) =>
  useFetch(() => transactionsApi.list(p), [p.month, p.categoryId, p.type, p.limit, p.cursor])

export const useBreakdown = (month = currentMonth()) =>
  useFetch(async () => (await summaryApi.getBreakdown(month)).breakdown, [month])

export const useTopCategories = (month = currentMonth(), type?: TransactionType, limit = 5) =>
  useFetch(async () => (await summaryApi.getTopCategories({ month, type, limit })).topCategories, [month, type, limit])
