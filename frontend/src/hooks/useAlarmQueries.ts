import { useQuery } from '@tanstack/react-query'
import { alarmService, sensorsService } from '@/services'
import { useAuthStore } from '@/stores'
import { queryKeys } from '@/types'

export function useAlarmStateQuery() {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.alarm.state,
    queryFn: alarmService.getState,
    enabled: isAuthenticated,
  })
}

export function useAlarmSettingsQuery() {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.alarm.settings,
    queryFn: alarmService.getSettings,
    enabled: isAuthenticated,
  })
}

export function useSensorsQuery() {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.sensors.all,
    queryFn: sensorsService.getSensors,
    enabled: isAuthenticated,
  })
}

export function useRecentEventsQuery(limit = 10) {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.events.recent,
    queryFn: () => alarmService.getRecentEvents(limit),
    enabled: isAuthenticated,
  })
}

