'use client'
import { createContext, useContext, useEffect, useState } from 'react'

interface ThemeCtx { isDark: boolean; toggle: () => void }
const Ctx = createContext<ThemeCtx>({ isDark: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('fm-theme')
    const dark  = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  const toggle = () => {
    setIsDark(prev => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('fm-theme', next ? 'dark' : 'light')
      return next
    })
  }

  return <Ctx.Provider value={{ isDark, toggle }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
