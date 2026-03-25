import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { AuthProvider } from '@/lib/auth-context'
import { PlanProvider } from '@/lib/plan-context'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <PlanProvider>
        <Component {...pageProps} />
      </PlanProvider>
    </AuthProvider>
  )
}
