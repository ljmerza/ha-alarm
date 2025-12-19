import api from './api'
import { StorageKeys } from '@/lib/constants'
import type { User, LoginCredentials, LoginResponse, TokenPair } from '@/types'

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/api/auth/login/', credentials)

    if (response.accessToken) {
      localStorage.setItem(StorageKeys.AUTH_TOKEN, response.accessToken)
      localStorage.setItem(StorageKeys.REFRESH_TOKEN, response.refreshToken)
    }

    return response
  },

  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout/')
    } finally {
      localStorage.removeItem(StorageKeys.AUTH_TOKEN)
      localStorage.removeItem(StorageKeys.REFRESH_TOKEN)
    }
  },

  async refreshToken(): Promise<TokenPair> {
    const refreshToken = localStorage.getItem(StorageKeys.REFRESH_TOKEN)
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await api.post<TokenPair>('/api/auth/token/refresh/', {
      refresh: refreshToken,
    })

    localStorage.setItem(StorageKeys.AUTH_TOKEN, response.accessToken)
    localStorage.setItem(StorageKeys.REFRESH_TOKEN, response.refreshToken)

    return response
  },

  async getCurrentUser(): Promise<User> {
    return api.get<User>('/api/users/me/')
  },

  async verify2FA(code: string): Promise<LoginResponse> {
    return api.post<LoginResponse>('/api/auth/2fa/verify/', { code })
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem(StorageKeys.AUTH_TOKEN)
  },

  getToken(): string | null {
    return localStorage.getItem(StorageKeys.AUTH_TOKEN)
  },
}

export default authService
