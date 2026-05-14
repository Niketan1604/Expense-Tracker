'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowLeftRight, Tag, Target, User, LogOut, Wallet, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from './ThemeProvider'

const NAV = [
  { label: 'Dashboard',    icon: LayoutDashboard, href: '/' },
  { label: 'Transactions', icon: ArrowLeftRight,  href: '/transactions' },
  { label: 'Categories',   icon: Tag,             href: '/categories' },
  { label: 'Budgets',      icon: Target,          href: '/budgets' },
  { label: 'Profile',      icon: User,            href: '/profile' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { signOut } = useAuth()
  const { isDark, toggle } = useTheme()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 hidden lg:flex flex-col z-50 sidebar">
      {/* Logo */}
      <div className="px-6 pt-7 pb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-mint-500 shadow-lg shadow-mint-500/30">
            <Wallet className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-black tracking-tight text" style={{ letterSpacing: '-0.03em' }}>FlowMint</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ label, icon: Icon, href }) => {
          const active = isActive(href)
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150',
                active
                  ? 'bg-mint-100 text-mint-500 dark:bg-mint-100'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-6 pt-4 border-t border-border space-y-0.5">
        <button onClick={toggle}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text transition-all">
          {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={handleSignOut}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-all">
          <LogOut className="w-[18px] h-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
