import api from './api'
import type {
  MqttSettings,
  MqttSettingsUpdate,
  MqttStatus,
  MqttTestConnectionRequest,
} from '@/types'

export const mqttService = {
  async getStatus(): Promise<MqttStatus> {
    return api.get<MqttStatus>('/api/alarm/mqtt/status/')
  },

  async getSettings(): Promise<MqttSettings> {
    return api.get<MqttSettings>('/api/alarm/mqtt/settings/')
  },

  async updateSettings(changes: MqttSettingsUpdate): Promise<MqttSettings> {
    return api.patch<MqttSettings>('/api/alarm/mqtt/settings/', changes)
  },

  async testConnection(payload: MqttTestConnectionRequest): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>('/api/alarm/mqtt/test/', payload)
  },
}

export default mqttService

