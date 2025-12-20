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
    hasZones: boolean
    hasSensors: boolean
    homeAssistantConnected: boolean
  }
}

export interface OnboardingRequest {
  email: string
  password: string
  homeName: string
}

export interface OnboardingResponse {
  userId: string
  email: string
  homeName: string
  timezone: string
}

export const onboardingService = {
  async status(): Promise<OnboardingStatus> {
    const response = await api.get<{ onboardingRequired: boolean }>('/api/onboarding/')
    return { onboardingRequired: response.onboardingRequired }
  },

  async create(payload: OnboardingRequest): Promise<OnboardingResponse> {
    const response = await api.post<{
      userId: string
      email: string
      homeName: string
      timezone: string
    }>('/api/onboarding/', {
      email: payload.email,
      password: payload.password,
      homeName: payload.homeName,
    })

    return {
      userId: response.userId,
      email: response.email,
      homeName: response.homeName,
      timezone: response.timezone,
    }
  },

  async setupStatus(): Promise<SetupStatus> {
    return api.get<SetupStatus>('/api/onboarding/setup-status/')
  },
}

export default onboardingService
