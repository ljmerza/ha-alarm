import api from './api'
import type {
  HomeAssistantMqttAlarmEntitySettings,
  HomeAssistantMqttAlarmEntitySettingsUpdate,
  HomeAssistantMqttAlarmEntityStatusResponse,
} from '@/types'

export const integrationsService = {
  homeAssistantMqttAlarmEntity: {
    async getSettings(): Promise<HomeAssistantMqttAlarmEntitySettings> {
      return api.get<HomeAssistantMqttAlarmEntitySettings>(
        '/api/alarm/integrations/home-assistant/mqtt-alarm-entity/'
      )
    },

    async updateSettings(
      changes: HomeAssistantMqttAlarmEntitySettingsUpdate
    ): Promise<HomeAssistantMqttAlarmEntitySettings> {
      return api.patch<HomeAssistantMqttAlarmEntitySettings>(
        '/api/alarm/integrations/home-assistant/mqtt-alarm-entity/',
        changes
      )
    },

    async getStatus(): Promise<HomeAssistantMqttAlarmEntityStatusResponse> {
      return api.get<HomeAssistantMqttAlarmEntityStatusResponse>(
        '/api/alarm/integrations/home-assistant/mqtt-alarm-entity/status/'
      )
    },

    async publishDiscovery(): Promise<{ ok: boolean }> {
      return api.post<{ ok: boolean }>(
        '/api/alarm/integrations/home-assistant/mqtt-alarm-entity/publish-discovery/',
        {}
      )
    },
  },
}

export default integrationsService

