import api from './api'
import type { User, LoginCredentials, LoginResponse } from '@/types'

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return api.post<LoginResponse>('/api/auth/login/', credentials)
  },

  async logout(): Promise<void> {
    await api.post('/api/auth/logout/')
  },

  async getCurrentUser(): Promise<User> {
    return api.get<User>('/api/users/me/')
  },

  async verify2FA(code: string): Promise<LoginResponse> {
    return api.post<LoginResponse>('/api/auth/2fa/verify/', { code })
  },
}

export default authService
