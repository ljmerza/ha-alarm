import { useEffect, useCallback } from 'react'
import { useAlarmStore } from '@/stores'
import { AlarmState } from '@/lib/constants'

export function useAlarm() {
  const {
    alarmState,
    settings,
    zones,
    recentEvents,
    wsStatus,
    countdown,
    isLoading,
    error,
    fetchAlarmState,
    fetchSettings,
    fetchZones,
    fetchRecentEvents,
    arm,
    disarm,
    cancelArming,
    bypassZone,
    unbypassZone,
    connectWebSocket,
    disconnectWebSocket,
    clearError,
  } = useAlarmStore()

  // Initialize on mount
  useEffect(() => {
    fetchAlarmState()
    fetchSettings()
    fetchZones()
    fetchRecentEvents()
    connectWebSocket()

    return () => {
      disconnectWebSocket()
    }
  }, [fetchAlarmState, fetchSettings, fetchZones, fetchRecentEvents, connectWebSocket, disconnectWebSocket])

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

  // Check for open sensors that might prevent arming
  const openSensors = zones
    .flatMap((zone) => zone.sensors)
    .filter((sensor) => sensor.currentState === 'open' && sensor.isActive)

  // "Down/unavailable" sensors: configured but status can't be read
  const unknownSensors = zones
    .flatMap((zone) => zone.sensors)
    .filter(
      (sensor) =>
        sensor.isActive &&
        sensor.entityId &&
        sensor.currentState === 'unknown'
    )

  const canArm = openSensors.length === 0 || settings?.sensorBehavior?.forceArmEnabled

  return {
    // State
    alarmState,
    currentState,
    settings,
    zones,
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
    bypassZone,
    unbypassZone,
    clearError,

    // Refresh
    refresh: useCallback(() => {
      fetchAlarmState()
      fetchZones()
      fetchRecentEvents()
    }, [fetchAlarmState, fetchZones, fetchRecentEvents]),
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
