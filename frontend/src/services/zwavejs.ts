import api from './api'
import type { ZwavejsSettings, ZwavejsSettingsUpdate, ZwavejsStatus, ZwavejsTestConnectionRequest } from '@/types'

export const zwavejsService = {
  async getStatus(): Promise<ZwavejsStatus> {
    return api.get<ZwavejsStatus>('/api/alarm/zwavejs/status/')
  },

  async getSettings(): Promise<ZwavejsSettings> {
    return api.get<ZwavejsSettings>('/api/alarm/zwavejs/settings/')
  },

  async updateSettings(changes: ZwavejsSettingsUpdate): Promise<ZwavejsSettings> {
    return api.patch<ZwavejsSettings>('/api/alarm/zwavejs/settings/', changes)
  },

  async testConnection(payload: ZwavejsTestConnectionRequest): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>('/api/alarm/zwavejs/test/', payload)
  },

  async syncEntities(): Promise<{ imported: number; updated: number; timestamp: string }> {
    return api.post<{ imported: number; updated: number; timestamp: string }>('/api/alarm/zwavejs/entities/sync/', {})
  },
}

export default zwavejsService
