import { format, parseISO } from 'date-fns'

// ── Monetary ───────────────────────────────────────────────────────────────────

export function paiseToDecimal(paise: number): number {
  return paise / 100
}

export function decimalToPaise(amount: number): number {
  return Math.round(amount * 100)
}

export function getCurrencySymbol(currency = 'INR'): string {
  const map: Record<string, string> = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£',
    AUD: 'A$', CAD: 'C$', SGD: 'S$', JPY: '¥',
  }
  return map[currency] ?? currency
}

export function formatAmount(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paiseToDecimal(paise))
}

export function formatAmountCompact(paise: number, currency = 'INR'): string {
  const v = paiseToDecimal(paise)
  const sym = getCurrencySymbol(currency)
  if (Math.abs(v) >= 10_00_000) return `${sym}${(v / 10_00_000).toFixed(1)}Cr`
  if (Math.abs(v) >= 1_00_000)  return `${sym}${(v / 1_00_000).toFixed(1)}L`
  if (Math.abs(v) >= 1_000)     return `${sym}${(v / 1_000).toFixed(1)}K`
  return `${sym}${v.toFixed(0)}`
}

// ── Date ───────────────────────────────────────────────────────────────────────

export function currentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function formatMonth(month: string): string {
  return format(parseISO(`${month}-01`), 'MMMM yyyy')
}

export function formatMonthShort(month: string): string {
  return format(parseISO(`${month}-01`), "MMM ''yy")
}

export function formatDate(date: string): string {
  return format(parseISO(date), 'd MMM yyyy')
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
