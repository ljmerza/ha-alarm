import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Routes } from '@/lib/constants'
import { useAuthStore, useSetupStore } from '@/stores'
import { Spinner } from '@/components/ui/spinner'

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
    return <Spinner fullscreen size="lg" />
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
