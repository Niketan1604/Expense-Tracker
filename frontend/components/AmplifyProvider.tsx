'use client'
import { configureAmplify } from '@/lib/amplify-config'

// Configure at module scope so Amplify is ready before ANY useEffect fires.
// The browser guard inside configureAmplify() prevents this running on the server.
// This must happen before the callback page's useEffect calls signInWithRedirect().
if (typeof window !== 'undefined') {
  configureAmplify()
}

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}