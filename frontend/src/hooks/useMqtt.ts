import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mqttService } from '@/services'
import { queryKeys } from '@/types'
import type { HomeAssistantAlarmEntitySettingsUpdate, MqttSettingsUpdate, MqttTestConnectionRequest } from '@/types'
import { useAuthSessionQuery, useCurrentUserQuery } from '@/hooks/useAuthQueries'
import { UserRole } from '@/lib/constants'

export function useMqttStatusQuery() {
  const session = useAuthSessionQuery()
  const isAuthenticated = session.data?.isAuthenticated ?? false
  return useQuery({
    queryKey: queryKeys.mqtt.status,
    queryFn: mqttService.getStatus,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  })
}

export function useMqttSettingsQuery() {
  const session = useAuthSessionQuery()
  const userQuery = useCurrentUserQuery()
  const isAuthenticated = session.data?.isAuthenticated ?? false
  const isAdmin = userQuery.data?.role === UserRole.ADMIN
  return useQuery({
    queryKey: queryKeys.mqtt.settings,
    queryFn: mqttService.getSettings,
    enabled: isAuthenticated && isAdmin,
  })
}

export function useMqttAlarmEntityQuery() {
  const session = useAuthSessionQuery()
  const userQuery = useCurrentUserQuery()
  const isAuthenticated = session.data?.isAuthenticated ?? false
  const isAdmin = userQuery.data?.role === UserRole.ADMIN
  return useQuery({
    queryKey: queryKeys.mqtt.alarmEntity,
    queryFn: mqttService.getAlarmEntitySettings,
    enabled: isAuthenticated && isAdmin,
  })
}

export function useUpdateMqttSettingsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: MqttSettingsUpdate) => mqttService.updateSettings(changes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.mqtt.settings })
      await queryClient.invalidateQueries({ queryKey: queryKeys.mqtt.status })
    },
  })
}

export function useTestMqttConnectionMutation() {
  return useMutation({
    mutationFn: (payload: MqttTestConnectionRequest) => mqttService.testConnection(payload),
  })
}

export function usePublishMqttDiscoveryMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => mqttService.publishDiscovery(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.mqtt.status })
    },
  })
}

export function useUpdateMqttAlarmEntityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: HomeAssistantAlarmEntitySettingsUpdate) => mqttService.updateAlarmEntitySettings(changes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.mqtt.alarmEntity })
    },
  })
}
