'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowLeftRight, Tag, Target, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Home',    icon: LayoutDashboard, href: '/' },
  { label: 'Txns',   icon: ArrowLeftRight,  href: '/transactions' },
  { label: 'Cats',   icon: Tag,             href: '/categories' },
  { label: 'Budget', icon: Target,          href: '/budgets' },
  { label: 'Split',  icon: Users,           href: '/splitwise' },
  { label: 'Me',     icon: User,            href: '/profile' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bottom-nav">
      <div className="flex h-16 items-center justify-around px-2">
        {NAV.map(({ label, icon: Icon, href }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 transition-colors',
                active ? 'text-mint-500' : 'text-muted'
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-bold">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
