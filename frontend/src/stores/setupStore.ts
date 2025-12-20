import { create } from 'zustand'
import { onboardingService } from '@/services'
import type { SetupStatus } from '@/services/onboarding'

interface SetupStore {
  status: SetupStatus | null
  isLoading: boolean
  error: string | null
  checkStatus: () => Promise<SetupStatus | null>
  clear: () => void
}

export const useSetupStore = create<SetupStore>((set) => ({
  status: null,
  isLoading: false,
  error: null,

  checkStatus: async () => {
    set({ isLoading: true, error: null })
    try {
      const status = await onboardingService.setupStatus()
      set({ status, isLoading: false })
      return status
    } catch (error) {
      set({
        status: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to check setup status',
      })
      return null
    }
  },

  clear: () => set({ status: null, isLoading: false, error: null }),
}))

export default useSetupStore
