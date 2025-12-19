import api from './api'
import type {
  AlarmStateSnapshot,
  AlarmSettingsProfile,
  ArmRequest,
  DisarmRequest,
  AlarmEvent,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export const alarmService = {
  // State
  async getState(): Promise<AlarmStateSnapshot> {
    return api.get<AlarmStateSnapshot>('/api/alarm/state/')
  },

  async arm(request: ArmRequest): Promise<AlarmStateSnapshot> {
    return api.post<AlarmStateSnapshot>('/api/alarm/arm/', request)
  },

  async disarm(request: DisarmRequest): Promise<AlarmStateSnapshot> {
    return api.post<AlarmStateSnapshot>('/api/alarm/disarm/', request)
  },

  async cancelArming(code?: string): Promise<AlarmStateSnapshot> {
    return api.post<AlarmStateSnapshot>('/api/alarm/cancel/', { code })
  },

  async trigger(): Promise<AlarmStateSnapshot> {
    return api.post<AlarmStateSnapshot>('/api/alarm/trigger/')
  },

  // Settings
  async getSettings(): Promise<AlarmSettingsProfile> {
    return api.get<AlarmSettingsProfile>('/api/alarm/settings/')
  },

  async getSettingsProfiles(): Promise<AlarmSettingsProfile[]> {
    return api.get<AlarmSettingsProfile[]>('/api/alarm/settings/profiles/')
  },

  async getSettingsProfile(id: number): Promise<AlarmSettingsProfile> {
    return api.get<AlarmSettingsProfile>(`/api/alarm/settings/profiles/${id}/`)
  },

  async createSettingsProfile(
    profile: Omit<AlarmSettingsProfile, 'id' | 'createdAt' | 'modifiedAt'>
  ): Promise<AlarmSettingsProfile> {
    return api.post<AlarmSettingsProfile>('/api/alarm/settings/profiles/', profile)
  },

  async updateSettingsProfile(
    id: number,
    profile: Partial<AlarmSettingsProfile>
  ): Promise<AlarmSettingsProfile> {
    return api.patch<AlarmSettingsProfile>(`/api/alarm/settings/profiles/${id}/`, profile)
  },

  async deleteSettingsProfile(id: number): Promise<void> {
    return api.delete(`/api/alarm/settings/profiles/${id}/`)
  },

  async activateSettingsProfile(id: number): Promise<AlarmSettingsProfile> {
    return api.post<AlarmSettingsProfile>(`/api/alarm/settings/profiles/${id}/activate/`)
  },

  // Events
  async getEvents(params?: PaginationParams & {
    eventType?: string
    startDate?: string
    endDate?: string
    userId?: number
  }): Promise<PaginatedResponse<AlarmEvent>> {
    return api.get<PaginatedResponse<AlarmEvent>>('/api/events/', params ? { ...params } : undefined)
  },

  async getRecentEvents(limit: number = 10): Promise<AlarmEvent[]> {
    const response = await api.get<PaginatedResponse<AlarmEvent>>('/api/events/', {
      pageSize: limit,
      ordering: '-timestamp',
    })
    return response.data
  },

  async acknowledgeEvent(id: number): Promise<AlarmEvent> {
    return api.patch<AlarmEvent>(`/api/events/${id}/acknowledge/`, {})
  },
}

export default alarmService
