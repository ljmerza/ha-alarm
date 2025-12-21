import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmState } from '@/lib/constants'
import type { AlarmStateType } from '@/lib/constants'
import { alarmService } from '@/services'
import type { AlarmEvent, AlarmSettingsProfile, AlarmStateSnapshot, CountdownPayload, Sensor } from '@/types'
import { queryKeys } from '@/types'
import { useWebSocketStatus } from '@/hooks/useWebSocketStatus'
import { useAlarmStateQuery, useAlarmSettingsQuery, useSensorsQuery, useRecentEventsQuery } from '@/hooks/useAlarmQueries'

export function useAlarm() {
  const queryClient = useQueryClient()

  const alarmStateQuery = useAlarmStateQuery()
  const settingsQuery = useAlarmSettingsQuery()
  const sensorsQuery = useSensorsQuery()
  const recentEventsQuery = useRecentEventsQuery(10)

  const countdownQuery = useQuery<CountdownPayload | null>({
    queryKey: queryKeys.alarm.countdown,
    queryFn: async () => null,
    initialData: null,
    enabled: false,
  })
  const wsStatusQuery = useWebSocketStatus()

  const armMutation = useMutation({
    mutationFn: ({ targetState, code }: { targetState: AlarmStateType; code?: string }) =>
      alarmService.arm({ targetState, code }),
    onSuccess: (nextState) => {
      queryClient.setQueryData(queryKeys.alarm.state, nextState)
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.recent })
    },
  })

  const disarmMutation = useMutation({
    mutationFn: ({ code }: { code: string }) => alarmService.disarm({ code }),
    onSuccess: (nextState) => {
      queryClient.setQueryData(queryKeys.alarm.state, nextState)
      queryClient.setQueryData(queryKeys.alarm.countdown, null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.recent })
    },
  })

  const cancelArmingMutation = useMutation({
    mutationFn: ({ code }: { code?: string }) => alarmService.cancelArming(code),
    onSuccess: (nextState) => {
      queryClient.setQueryData(queryKeys.alarm.state, nextState)
      queryClient.setQueryData(queryKeys.alarm.countdown, null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.recent })
    },
  })

  const alarmState: AlarmStateSnapshot | null = alarmStateQuery.data ?? null
  const settings: AlarmSettingsProfile | null = settingsQuery.data ?? null
  const sensors: Sensor[] = useMemo(() => sensorsQuery.data ?? [], [sensorsQuery.data])
  const recentEvents: AlarmEvent[] = useMemo(() => recentEventsQuery.data ?? [], [recentEventsQuery.data])
  const countdown: CountdownPayload | null = countdownQuery.data ?? null

  const isLoading =
    alarmStateQuery.isLoading ||
    settingsQuery.isLoading ||
    sensorsQuery.isLoading ||
    recentEventsQuery.isLoading ||
    armMutation.isPending ||
    disarmMutation.isPending ||
    cancelArmingMutation.isPending

  const error =
    (alarmStateQuery.error as { message?: string } | null)?.message ||
    (settingsQuery.error as { message?: string } | null)?.message ||
    (sensorsQuery.error as { message?: string } | null)?.message ||
    (recentEventsQuery.error as { message?: string } | null)?.message ||
    (armMutation.error as { message?: string } | null)?.message ||
    (disarmMutation.error as { message?: string } | null)?.message ||
    (cancelArmingMutation.error as { message?: string } | null)?.message ||
    null

  const currentState = alarmState?.currentState ?? AlarmState.DISARMED
  const armedStates: string[] = [
    AlarmState.ARMED_HOME,
    AlarmState.ARMED_AWAY,
    AlarmState.ARMED_NIGHT,
    AlarmState.ARMED_VACATION,
  ]
  const isArmed = armedStates.includes(currentState)
  const isDisarmed = currentState === AlarmState.DISARMED
  const isArming = currentState === AlarmState.ARMING
  const isPending = currentState === AlarmState.PENDING
  const isTriggered = currentState === AlarmState.TRIGGERED

  const codeRequiredForArm = settings?.codeArmRequired ?? true

  const availableArmingStates = settings?.availableArmingStates ?? [
    AlarmState.ARMED_HOME,
    AlarmState.ARMED_AWAY,
    AlarmState.ARMED_NIGHT,
    AlarmState.ARMED_VACATION,
  ]

  const isUsedInRules = (sensor: Sensor) => sensor.usedInRules !== false

  const openSensors = useMemo(
    () =>
      sensors.filter((sensor) => isUsedInRules(sensor) && sensor.currentState === 'open' && sensor.isActive),
    [sensors]
  )

  const unknownSensors = useMemo(
    () =>
      sensors.filter(
        (sensor) =>
          isUsedInRules(sensor) &&
          sensor.isActive &&
          !!sensor.entityId &&
          sensor.currentState === 'unknown'
      ),
    [sensors]
  )

  const canArm = openSensors.length === 0 || settings?.sensorBehavior?.forceArmEnabled

  const arm = useCallback(
    async (targetState: AlarmStateType, code?: string) => {
      await armMutation.mutateAsync({ targetState, code })
    },
    [armMutation]
  )

  const disarm = useCallback(
    async (code: string) => {
      await disarmMutation.mutateAsync({ code })
    },
    [disarmMutation]
  )

  const cancelArming = useCallback(
    async (code?: string) => {
      await cancelArmingMutation.mutateAsync({ code })
    },
    [cancelArmingMutation]
  )

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.alarm.state })
    void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.events.recent })
  }, [queryClient])

  const clearError = useCallback(() => {
    armMutation.reset()
    disarmMutation.reset()
    cancelArmingMutation.reset()
  }, [armMutation, disarmMutation, cancelArmingMutation])

  const armHome = useCallback((code?: string) => arm(AlarmState.ARMED_HOME, code), [arm])
  const armAway = useCallback((code?: string) => arm(AlarmState.ARMED_AWAY, code), [arm])
  const armNight = useCallback((code?: string) => arm(AlarmState.ARMED_NIGHT, code), [arm])
  const armVacation = useCallback((code?: string) => arm(AlarmState.ARMED_VACATION, code), [arm])

  return {
    alarmState,
    currentState,
    settings,
    sensors,
    recentEvents,
    wsStatus: wsStatusQuery.data,
    countdown,
    isLoading,
    error,

    isArmed,
    isDisarmed,
    isArming,
    isPending,
    isTriggered,
    codeRequiredForArm,
    availableArmingStates,
    openSensors,
    unknownSensors,
    canArm,

    arm,
    armHome,
    armAway,
    armNight,
    armVacation,
    disarm,
    cancelArming,
    clearError,
    refresh,
  }
}

export function useAlarmState() {
  const { alarmState, currentState, isArmed, isDisarmed, isArming, isPending, isTriggered } = useAlarm()

  return {
    alarmState,
    currentState,
    isArmed,
    isDisarmed,
    isArming,
    isPending,
    isTriggered,
  }
}

export default useAlarm
