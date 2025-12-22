import api from './api'

export interface HomeAssistantStatus {
  configured: boolean
  reachable: boolean
  baseUrl?: string | null
  error?: string | null
}

export interface HomeAssistantEntity {
  entityId: string
  domain: string
  state: string
  name: string
  deviceClass?: string | null
  unitOfMeasurement?: string | null
  lastChanged?: string | null
}

export const homeAssistantService = {
  async getStatus(): Promise<HomeAssistantStatus> {
    return api.get<HomeAssistantStatus>('/api/alarm/home-assistant/status/')
  },

  async listEntities(): Promise<HomeAssistantEntity[]> {
    return api.getData<HomeAssistantEntity[]>('/api/alarm/home-assistant/entities/')
  },

  async listNotifyServices(): Promise<string[]> {
    return api.getData<string[]>('/api/alarm/home-assistant/notify-services/')
  },
}

export default homeAssistantService
