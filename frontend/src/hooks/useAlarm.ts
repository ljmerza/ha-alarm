import { useEffect, useCallback } from 'react'
import { useAlarmStore } from '@/stores'
import { AlarmState } from '@/lib/constants'

export function useAlarm() {
  const {
    alarmState,
    settings,
    sensors,
    recentEvents,
    wsStatus,
    countdown,
    isLoading,
    error,
    fetchAlarmState,
    fetchSettings,
    fetchSensors,
    fetchRecentEvents,
    arm,
    disarm,
    cancelArming,
    connectWebSocket,
    disconnectWebSocket,
    clearError,
  } = useAlarmStore()

  // Initialize on mount
  useEffect(() => {
    fetchAlarmState()
    fetchSettings()
    fetchSensors()
    fetchRecentEvents()
    connectWebSocket()

    return () => {
      disconnectWebSocket()
    }
  }, [fetchAlarmState, fetchSettings, fetchSensors, fetchRecentEvents, connectWebSocket, disconnectWebSocket])

  // Computed values
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

  // Actions with state awareness
  const armHome = useCallback(
    (code?: string) => arm(AlarmState.ARMED_HOME, code),
    [arm]
  )

  const armAway = useCallback(
    (code?: string) => arm(AlarmState.ARMED_AWAY, code),
    [arm]
  )

  const armNight = useCallback(
    (code?: string) => arm(AlarmState.ARMED_NIGHT, code),
    [arm]
  )

  const armVacation = useCallback(
    (code?: string) => arm(AlarmState.ARMED_VACATION, code),
    [arm]
  )

  // Check if code is required for arming
  const codeRequiredForArm = settings?.codeArmRequired ?? true

  // Get available arming states
  const availableArmingStates = settings?.availableArmingStates ?? [
    AlarmState.ARMED_HOME,
    AlarmState.ARMED_AWAY,
    AlarmState.ARMED_NIGHT,
    AlarmState.ARMED_VACATION,
  ]

  const isUsedInRules = (sensor: (typeof sensors)[number]) => sensor.usedInRules !== false

  // Check for open sensors that might prevent arming (only entities in enabled rules)
  const openSensors = sensors.filter(
    (sensor) => isUsedInRules(sensor) && sensor.currentState === 'open' && sensor.isActive
  )

  // "Down/unavailable" sensors: configured but status can't be read
  const unknownSensors = sensors.filter(
    (sensor) => isUsedInRules(sensor) && sensor.isActive && sensor.entityId && sensor.currentState === 'unknown'
  )

  const canArm = openSensors.length === 0 || settings?.sensorBehavior?.forceArmEnabled

  return {
    // State
    alarmState,
    currentState,
    settings,
    sensors,
    recentEvents,
    wsStatus,
    countdown,
    isLoading,
    error,

    // Computed
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

    // Actions
    arm,
    armHome,
    armAway,
    armNight,
    armVacation,
    disarm,
    cancelArming,
    clearError,

    // Refresh
    refresh: useCallback(() => {
      fetchAlarmState()
      fetchSensors()
      fetchRecentEvents()
    }, [fetchAlarmState, fetchSensors, fetchRecentEvents]),
  }
}

export function useAlarmState() {
  const { alarmState, currentState, isArmed, isDisarmed, isArming, isPending, isTriggered } =
    useAlarm()

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
