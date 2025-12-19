import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthState, LoginCredentials } from '@/types'
import { authService } from '@/services'
import { StorageKeys } from '@/lib/constants'

interface AuthStore extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  verify2FA: (code: string) => Promise<void>
  fetchCurrentUser: () => Promise<void>
  setUser: (user: User | null) => void
  clearError: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authService.login(credentials)
          if (response.requires2FA) {
            set({ isLoading: false })
            throw new Error('2FA_REQUIRED')
          }
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          })
          throw error
        }
      },

      logout: async () => {
        set({ isLoading: true })
        try {
          await authService.logout()
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          })
        }
      },

      verify2FA: async (code: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authService.verify2FA(code)
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : '2FA verification failed',
          })
          throw error
        }
      },

      fetchCurrentUser: async () => {
        if (!authService.isAuthenticated()) {
          set({ user: null, isAuthenticated: false })
          return
        }

        set({ isLoading: true })
        try {
          const user = await authService.getCurrentUser()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch {
          // Token might be expired, try to refresh
          try {
            await authService.refreshToken()
            const user = await authService.getCurrentUser()
            set({ user, isAuthenticated: true, isLoading: false })
          } catch {
            // Refresh failed, clear auth state
            set({ user: null, isAuthenticated: false, isLoading: false })
            localStorage.removeItem(StorageKeys.AUTH_TOKEN)
            localStorage.removeItem(StorageKeys.REFRESH_TOKEN)
          }
        }
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user })
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'alarm-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export default useAuthStore
