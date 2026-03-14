'use client'
import { configureAmplify } from '@/lib/amplify-config'
configureAmplify()
export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
