import api from './api'
import type {
  HomeAssistantAlarmEntitySettings,
  HomeAssistantAlarmEntitySettingsUpdate,
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

  async publishDiscovery(): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>('/api/alarm/mqtt/publish-discovery/', {})
  },

  async getAlarmEntitySettings(): Promise<HomeAssistantAlarmEntitySettings> {
    return api.get<HomeAssistantAlarmEntitySettings>('/api/alarm/mqtt/alarm-entity/')
  },

  async updateAlarmEntitySettings(
    changes: HomeAssistantAlarmEntitySettingsUpdate
  ): Promise<HomeAssistantAlarmEntitySettings> {
    return api.patch<HomeAssistantAlarmEntitySettings>('/api/alarm/mqtt/alarm-entity/', changes)
  },
}

export default mqttService

