export interface MqttStatus {
  configured: boolean
  enabled: boolean
  connected: boolean
  lastConnectAt: string | null
  lastDisconnectAt: string | null
  lastError: string | null
  alarmEntity?: {
    enabled: boolean
    haEntityId: string | null
    entityName: string | null
    lastDiscoveryPublishAt: string | null
    lastStatePublishAt: string | null
    lastAvailabilityPublishAt: string | null
    lastErrorAt: string | null
    lastError: string | null
  }
}

export interface MqttSettings {
  enabled: boolean
  host: string
  port: number
  username: string
  useTls: boolean
  tlsInsecure: boolean
  clientId: string
  keepaliveSeconds: number
  connectTimeoutSeconds: number
  hasPassword: boolean
}

export interface MqttSettingsUpdate {
  enabled?: boolean
  host?: string
  port?: number
  username?: string
  password?: string
  useTls?: boolean
  tlsInsecure?: boolean
  clientId?: string
  keepaliveSeconds?: number
  connectTimeoutSeconds?: number
}

export interface MqttTestConnectionRequest {
  host: string
  port: number
  username?: string
  password?: string
  useTls?: boolean
  tlsInsecure?: boolean
  clientId?: string
  keepaliveSeconds?: number
  connectTimeoutSeconds?: number
}

export interface HomeAssistantAlarmEntitySettings {
  enabled: boolean
  entityName: string
  alsoRenameInHomeAssistant: boolean
  haEntityId: string
}

export interface HomeAssistantAlarmEntitySettingsUpdate {
  enabled?: boolean
  entityName?: string
  alsoRenameInHomeAssistant?: boolean
  haEntityId?: string
}
