import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes as AppRoutes } from '@/lib/constants'
import { AppShell, ProtectedRoute, SetupGate } from '@/components/layout'
import { AppErrorBoundary } from '@/components/providers/AppErrorBoundary'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { LayoutBootstrap } from '@/components/providers/LayoutBootstrap'
import { ModalProvider } from '@/components/modals'
import { Spinner } from '@/components/ui/spinner'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingQueries'
import { useCurrentUserQuery } from '@/hooks/useAuthQueries'
import { useGlobalQueryErrorHandler } from '@/hooks/useQueryErrorHandler'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const SetupWizardPage = lazy(() => import('@/pages/SetupWizardPage'))
const ImportSensorsPage = lazy(() => import('@/pages/ImportSensorsPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const RulesPage = lazy(() => import('@/pages/RulesPage'))
const RulesTestPage = lazy(() => import('@/pages/RulesTestPage'))
const CodesPage = lazy(() => import('@/pages/CodesPage'))
const DoorCodesPage = lazy(() => import('@/pages/DoorCodesPage'))
const EventsPage = lazy(() => import('@/pages/EventsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

function AppContent() {
  useGlobalQueryErrorHandler()
  const onboardingStatusQuery = useOnboardingStatusQuery()
  const onboardingRequired = onboardingStatusQuery.data?.onboardingRequired ?? null
  const onboardingLoading = onboardingStatusQuery.isLoading
  useCurrentUserQuery()

  if (onboardingLoading || onboardingRequired === null) {
    return <Spinner fullscreen size="lg" />
  }

  return (
    <>
      <Suspense fallback={<Spinner fullscreen size="lg" />}>
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
            <Route path={AppRoutes.RULES} element={<RulesPage />} />
            <Route path={AppRoutes.RULES_TEST} element={<RulesTestPage />} />
            <Route path={AppRoutes.CODES} element={<CodesPage />} />
            <Route path={AppRoutes.DOOR_CODES} element={<DoorCodesPage />} />
            <Route path={AppRoutes.EVENTS} element={<EventsPage />} />
            <Route path={AppRoutes.SETTINGS} element={<SettingsPage />} />
          </Route>

          {/* Redirects and 404 */}
          <Route path={AppRoutes.DASHBOARD} element={<Navigate to={AppRoutes.HOME} replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AppErrorBoundary>
            <LayoutBootstrap />
            <AppContent />
            <ModalProvider />
          </AppErrorBoundary>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
