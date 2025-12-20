import { create } from 'zustand'
import type {
  AlarmStateSnapshot,
  AlarmSettingsProfile,
  Sensor,
  AlarmEvent,
  WebSocketStatus,
  CountdownPayload,
} from '@/types'
import type { AlarmStateType } from '@/lib/constants'
import { alarmService, sensorsService, wsManager } from '@/services'

interface AlarmStore {
  // State
  alarmState: AlarmStateSnapshot | null
  settings: AlarmSettingsProfile | null
  sensors: Sensor[]
  recentEvents: AlarmEvent[]
  wsStatus: WebSocketStatus
  countdown: CountdownPayload | null
  isLoading: boolean
  error: string | null

  // Computed
  effectiveSettings: {
    delayTime: number
    armingTime: number
    triggerTime: number
  } | null

  // Actions
  fetchAlarmState: () => Promise<void>
  fetchSettings: () => Promise<void>
  fetchSensors: () => Promise<void>
  fetchRecentEvents: () => Promise<void>
  arm: (targetState: AlarmStateType, code?: string) => Promise<void>
  disarm: (code: string) => Promise<void>
  cancelArming: (code?: string) => Promise<void>

  // WebSocket
  connectWebSocket: () => void
  disconnectWebSocket: () => void
  setWsStatus: (status: WebSocketStatus) => void

  // Internal updates from WebSocket
  updateAlarmState: (state: AlarmStateSnapshot) => void
  addEvent: (event: AlarmEvent) => void
  setCountdown: (countdown: CountdownPayload | null) => void

  clearError: () => void
}

export const useAlarmStore = create<AlarmStore>((set, get) => ({
  alarmState: null,
  settings: null,
  sensors: [],
  recentEvents: [],
  wsStatus: 'disconnected',
  countdown: null,
  isLoading: false,
  error: null,
  effectiveSettings: null,

  fetchAlarmState: async () => {
    set({ isLoading: true, error: null })
    try {
      const alarmState = await alarmService.getState()
      set({ alarmState, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch alarm state',
      })
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await alarmService.getSettings()
      set({ settings })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch settings',
      })
    }
  },

  fetchSensors: async () => {
    try {
      const sensors = await sensorsService.getSensors()
      set({ sensors })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch sensors',
      })
    }
  },

  fetchRecentEvents: async () => {
    try {
      const recentEvents = await alarmService.getRecentEvents(10)
      set({ recentEvents })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch events',
      })
    }
  },

  arm: async (targetState: AlarmStateType, code?: string) => {
    set({ isLoading: true, error: null })
    try {
      const alarmState = await alarmService.arm({ targetState, code })
      set({ alarmState, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to arm',
      })
      throw error
    }
  },

  disarm: async (code: string) => {
    set({ isLoading: true, error: null })
    try {
      const alarmState = await alarmService.disarm({ code })
      set({ alarmState, isLoading: false, countdown: null })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to disarm',
      })
      throw error
    }
  },

  cancelArming: async (code?: string) => {
    set({ isLoading: true, error: null })
    try {
      const alarmState = await alarmService.cancelArming(code)
      set({ alarmState, isLoading: false, countdown: null })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to cancel arming',
      })
      throw error
    }
  },

  connectWebSocket: () => {
    wsManager.connect()

    wsManager.onStatusChange((status) => {
      set({ wsStatus: status })
    })

    wsManager.onMessage((message) => {
      switch (message.type) {
        case 'alarm_state':
          get().updateAlarmState((message.payload as { state: AlarmStateSnapshot }).state)
          break
        case 'event':
          get().addEvent((message.payload as { event: AlarmEvent }).event)
          break
        case 'countdown':
          get().setCountdown(message.payload as CountdownPayload)
          break
      }
    })
  },

  disconnectWebSocket: () => {
    wsManager.disconnect()
  },

  setWsStatus: (status: WebSocketStatus) => {
    set({ wsStatus: status })
  },

  updateAlarmState: (state: AlarmStateSnapshot) => {
    set({ alarmState: state })
  },

  addEvent: (event: AlarmEvent) => {
    const recentEvents = [event, ...get().recentEvents.slice(0, 9)]
    set({ recentEvents })
  },

  setCountdown: (countdown: CountdownPayload | null) => {
    set({ countdown })
  },

  clearError: () => {
    set({ error: null })
  },
}))

export default useAlarmStore
