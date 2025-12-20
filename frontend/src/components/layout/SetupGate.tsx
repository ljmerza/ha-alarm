import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Routes } from '@/lib/constants'
import { useAuthStore, useSetupStore } from '@/stores'

interface SetupGateProps {
  children: React.ReactNode
}

export function SetupGate({ children }: SetupGateProps) {
  const location = useLocation()
  const { isAuthenticated } = useAuthStore()
  const { status, isLoading, checkStatus } = useSetupStore()

  useEffect(() => {
    if (!isAuthenticated) return
    if (status) return
    void checkStatus()
  }, [isAuthenticated, status, checkStatus])

  if (!isAuthenticated) return <>{children}</>

  if (isLoading && !status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (status?.setupRequired) {
    if (!location.pathname.startsWith(Routes.SETUP)) {
      return <Navigate to={Routes.SETUP} replace />
    }
  } else if (location.pathname === Routes.SETUP) {
    return <Navigate to={Routes.HOME} replace />
  }

  return <>{children}</>
}

export default SetupGate
