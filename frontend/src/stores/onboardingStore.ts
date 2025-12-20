import { create } from 'zustand'
import { onboardingService } from '@/services'

interface OnboardingStore {
  onboardingRequired: boolean | null
  isLoading: boolean
  error: string | null
  checkStatus: () => Promise<void>
  setOnboardingRequired: (required: boolean) => void
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  onboardingRequired: null,
  isLoading: false,
  error: null,

  checkStatus: async () => {
    set({ isLoading: true, error: null })
    try {
      const status = await onboardingService.status()
      set({ onboardingRequired: status.onboardingRequired, isLoading: false })
    } catch (error) {
      set({
        onboardingRequired: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to check onboarding status',
      })
    }
  },

  setOnboardingRequired: (required: boolean) => {
    set({ onboardingRequired: required })
  },
}))

export default useOnboardingStore
