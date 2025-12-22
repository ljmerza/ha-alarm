import api from './api'
import type {
  AlarmStateSnapshot,
  AlarmSettingsProfile,
  ArmRequest,
  DisarmRequest,
  AlarmEvent,
  AlarmSettingsProfileDetail,
  AlarmSettingsProfileMeta,
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
    return api.post<AlarmStateSnapshot>('/api/alarm/cancel-arming/', { code })
  },

  async trigger(): Promise<AlarmStateSnapshot> {
    return api.post<AlarmStateSnapshot>('/api/alarm/trigger/')
  },

  // Settings
  async getSettings(): Promise<AlarmSettingsProfile> {
    return api.get<AlarmSettingsProfile>('/api/alarm/settings/')
  },

  async getSettingsProfiles(): Promise<AlarmSettingsProfile[]> {
    return api.get<AlarmSettingsProfileMeta[]>('/api/alarm/settings/profiles/')
  },

  async getSettingsProfile(id: number): Promise<AlarmSettingsProfileDetail> {
    return api.get<AlarmSettingsProfileDetail>(`/api/alarm/settings/profiles/${id}/`)
  },

  async createSettingsProfile(profile: { name: string }): Promise<AlarmSettingsProfileMeta> {
    return api.post<AlarmSettingsProfileMeta>('/api/alarm/settings/profiles/', profile)
  },

  async updateSettingsProfile(
    id: number,
    changes: { name?: string; entries?: Array<{ key: string; value: unknown }> }
  ): Promise<AlarmSettingsProfileDetail> {
    return api.patch<AlarmSettingsProfileDetail>(`/api/alarm/settings/profiles/${id}/`, changes)
  },

  async deleteSettingsProfile(id: number): Promise<void> {
    return api.delete(`/api/alarm/settings/profiles/${id}/`)
  },

  async activateSettingsProfile(id: number): Promise<AlarmSettingsProfileMeta> {
    return api.post<AlarmSettingsProfileMeta>(`/api/alarm/settings/profiles/${id}/activate/`)
  },

  // Events
  async getEvents(params?: PaginationParams & {
    eventType?: string
    startDate?: string
    endDate?: string
    userId?: string
  }): Promise<PaginatedResponse<AlarmEvent>> {
    return api.getPaginated<AlarmEvent>('/api/events/', params ? { ...params } : undefined)
  },

  async getRecentEvents(limit: number = 10): Promise<AlarmEvent[]> {
    return api.getPaginatedItems<AlarmEvent>('/api/events/', {
      pageSize: limit,
      ordering: '-timestamp',
    })
  },

  async acknowledgeEvent(id: number): Promise<AlarmEvent> {
    return api.patch<AlarmEvent>(`/api/events/${id}/acknowledge/`, {})
  },
}

export default alarmService
