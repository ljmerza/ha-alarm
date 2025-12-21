import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LoginCredentials, LoginResponse, TokenPair, User } from '@/types'
import type { ApiError } from '@/types'
import { authService } from '@/services'
import { StorageKeys } from '@/lib/constants'
import { queryKeys } from '@/types'

type AuthSession = {
  isAuthenticated: boolean
}

function getStoredAccessToken(): string | null {
  return localStorage.getItem(StorageKeys.AUTH_TOKEN)
}

function getStoredRefreshToken(): string | null {
  return localStorage.getItem(StorageKeys.REFRESH_TOKEN)
}

function clearTokens() {
  localStorage.removeItem(StorageKeys.AUTH_TOKEN)
  localStorage.removeItem(StorageKeys.REFRESH_TOKEN)
}

function isApiUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybe = error as ApiError
  return maybe.code === '401'
}

export function useAuthSessionQuery() {
  return useQuery<AuthSession>({
    queryKey: queryKeys.auth.session,
    queryFn: async () => ({ isAuthenticated: !!getStoredAccessToken() }),
    initialData: { isAuthenticated: !!getStoredAccessToken() },
    enabled: false,
  })
}

export function useCurrentUserQuery() {
  const queryClient = useQueryClient()
  const session = useAuthSessionQuery()
  const hasToken = !!getStoredAccessToken()

  const query = useQuery<User, ApiError>({
    queryKey: queryKeys.auth.currentUser,
    queryFn: async () => {
      const user = await authService.getCurrentUser()
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: true })
      return user
    },
    enabled: session.data.isAuthenticated && hasToken,
    retry: (failureCount, error) => {
      if (isApiUnauthorized(error)) return false
      return failureCount < 1
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!query.error) return
    if (!isApiUnauthorized(query.error)) return
    clearTokens()
    queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: false })
    queryClient.removeQueries({ queryKey: queryKeys.auth.currentUser })
  }, [query.error, queryClient])

  return query
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (credentials: LoginCredentials): Promise<LoginResponse> => {
      const response = await authService.login(credentials)
      if (response.requires2FA) {
        throw new Error('2FA_REQUIRED')
      }
      return response
    },
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: true })
      queryClient.setQueryData(queryKeys.auth.currentUser, response.user)
    },
    onError: (error) => {
      if (error instanceof Error && error.message === '2FA_REQUIRED') {
        // Keep session false until 2FA verify completes.
        return
      }
      clearTokens()
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: false })
      queryClient.removeQueries({ queryKey: queryKeys.auth.currentUser })
    },
  })
}

export function useVerify2FAMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => authService.verify2FA(code),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: true })
      queryClient.setQueryData(queryKeys.auth.currentUser, response.user)
    },
    onError: () => {
      // Do not clear tokens; backend may still consider login session pending.
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await authService.logout()
    },
    onSettled: async () => {
      clearTokens()
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: false })
      queryClient.removeQueries({ queryKey: queryKeys.auth.currentUser })
      await queryClient.invalidateQueries()
    },
  })
}

export function useRefreshTokenMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<TokenPair> => {
      const refreshToken = getStoredRefreshToken()
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }
      return authService.refreshToken()
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: !!getStoredAccessToken() })
    },
    onError: () => {
      clearTokens()
      queryClient.setQueryData(queryKeys.auth.session, { isAuthenticated: false })
      queryClient.removeQueries({ queryKey: queryKeys.auth.currentUser })
    },
  })
}
