import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { Routes } from '@/lib/constants'
import type { LoginCredentials } from '@/types'

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    verify2FA,
    fetchCurrentUser,
    clearError,
  } = useAuthStore()

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    verify2FA,
    fetchCurrentUser,
    clearError,
  }
}

export function useRequireAuth(redirectTo: string = Routes.LOGIN) {
  const { isAuthenticated, isLoading, fetchCurrentUser } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(redirectTo)
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo])

  return { isAuthenticated, isLoading }
}

export function useLogin() {
  const { login, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (credentials: LoginCredentials) => {
    try {
      await login(credentials)
      navigate(Routes.HOME)
    } catch (err) {
      if (err instanceof Error && err.message === '2FA_REQUIRED') {
        // Handle 2FA flow
        return { requires2FA: true }
      }
      throw err
    }
    return { requires2FA: false }
  }

  return {
    login: handleLogin,
    isLoading,
    error,
    clearError,
  }
}

export default useAuth
