import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes as AppRoutes } from '@/lib/constants'
import { useUIStore, useAuthStore } from '@/stores'
import { AppShell, ProtectedRoute } from '@/components/layout'
import {
  LoginPage,
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

  return (
    <Routes>
      {/* Public routes */}
      <Route path={AppRoutes.LOGIN} element={<LoginPage />} />

      {/* Protected routes with layout */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
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
