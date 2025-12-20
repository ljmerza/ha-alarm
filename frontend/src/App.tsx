import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes as AppRoutes } from '@/lib/constants'
import { useUIStore, useAuthStore, useOnboardingStore } from '@/stores'
import { AppShell, ProtectedRoute, SetupGate } from '@/components/layout'
import {
  LoginPage,
  OnboardingPage,
  SetupWizardPage,
  ImportSensorsPage,
  DashboardPage,
  ZonesPage,
  CodesPage,
  EventsPage,
  SettingsPage,
  NotFoundPage,
} from '@/pages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

function AppContent() {
  const { setIsMobile, setTheme, theme } = useUIStore()
  const { fetchCurrentUser } = useAuthStore()
  const { onboardingRequired, isLoading: onboardingLoading, checkStatus } =
    useOnboardingStore()

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setIsMobile])

  // Apply theme on mount
  useEffect(() => {
    setTheme(theme)
  }, [setTheme, theme])

  // Fetch current user on mount
  useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  // Check onboarding status on mount
  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  if (onboardingLoading || onboardingRequired === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path={AppRoutes.ONBOARDING}
        element={
          onboardingRequired ? (
            <OnboardingPage />
          ) : (
            <Navigate to={AppRoutes.LOGIN} replace />
          )
        }
      />
      <Route
        path={AppRoutes.LOGIN}
        element={
          onboardingRequired ? (
            <Navigate to={AppRoutes.ONBOARDING} replace />
          ) : (
            <LoginPage />
          )
        }
      />

      {/* Protected routes with layout */}
      <Route
        element={
          onboardingRequired ? (
            <Navigate to={AppRoutes.ONBOARDING} replace />
          ) : (
            <ProtectedRoute>
              <SetupGate>
                <AppShell />
              </SetupGate>
            </ProtectedRoute>
          )
        }
      >
        <Route path={AppRoutes.SETUP} element={<SetupWizardPage />} />
        <Route path={AppRoutes.SETUP_IMPORT_SENSORS} element={<ImportSensorsPage />} />
        <Route path={AppRoutes.HOME} element={<DashboardPage />} />
        <Route path={AppRoutes.ZONES} element={<ZonesPage />} />
        <Route path={AppRoutes.CODES} element={<CodesPage />} />
        <Route path={AppRoutes.EVENTS} element={<EventsPage />} />
        <Route path={AppRoutes.SETTINGS} element={<SettingsPage />} />
      </Route>

      {/* Redirects and 404 */}
      <Route path={AppRoutes.DASHBOARD} element={<Navigate to={AppRoutes.HOME} replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
