import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AmplifyProvider } from '@/components/AmplifyProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AppShell } from '@/components/AppShell'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'FlowMint',
  description: 'Personal Cash Flow Intelligence',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body suppressHydrationWarning>
        <AmplifyProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </AmplifyProvider>
      </body>
    </html>
  )
}
