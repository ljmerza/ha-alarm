import { api } from './api'

export interface OnboardingStatus {
  onboardingRequired: boolean
}

export interface SetupStatus {
  onboardingRequired: boolean
  setupRequired: boolean
  requirements: {
    hasActiveSettingsProfile: boolean
    hasAlarmSnapshot: boolean
    hasAlarmCode: boolean
    hasSensors: boolean
    homeAssistantConnected: boolean
  }
}

export interface OnboardingRequest {
  email: string
  password: string
}

export interface OnboardingResponse {
  userId: string
  email: string
}

export const onboardingService = {
  async status(): Promise<OnboardingStatus> {
    return api.get<OnboardingStatus>('/api/onboarding/')
  },

  async create(payload: OnboardingRequest): Promise<OnboardingResponse> {
    return api.post<OnboardingResponse>('/api/onboarding/', payload)
  },

  async setupStatus(): Promise<SetupStatus> {
    return api.get<SetupStatus>('/api/onboarding/setup-status/')
  },
}

export default onboardingService
