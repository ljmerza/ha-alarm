import type { AlarmStateType, EventTypeType } from '@/lib/constants'

// Alarm State Snapshot
export interface AlarmStateSnapshot {
  id: number
  currentState: AlarmStateType
  previousState: AlarmStateType | null
  settingsProfile: number
  enteredAt: string // ISO datetime
  exitAt: string | null // ISO datetime, for timed transitions
  lastTransitionReason: string
  lastTransitionBy: string | null // User ID (UUID)
  targetArmedState: AlarmStateType | null
  timingSnapshot: {
    delayTime?: number
    armingTime?: number
    triggerTime?: number
  }
}

// Alarm Settings Profile
export interface AlarmSettingsProfile {
  id: number
  name: string
  isActive: boolean
  delayTime: number // seconds
  armingTime: number // seconds
  triggerTime: number // seconds
  disarmAfterTrigger: boolean
  codeArmRequired: boolean
  availableArmingStates: AlarmStateType[]
  stateOverrides: StateOverrides
  audioVisualSettings: AudioVisualSettings
  sensorBehavior: SensorBehavior
  createdAt: string
  updatedAt: string
}

export interface StateOverrides {
  [state: string]: {
    delayTime?: number
    armingTime?: number
    triggerTime?: number
  }
}

export interface AudioVisualSettings {
  beepEnabled: boolean
  countdownDisplayEnabled: boolean
  colorCodingEnabled: boolean
}

export interface SensorBehavior {
  warnOnOpenSensors: boolean
  autoBypassEnabled: boolean
  forceArmEnabled: boolean
}

// Sensor
export interface Sensor {
  id: number
  name: string
  entityId: string | null // HA entity ID
  isActive: boolean
  isEntryPoint: boolean
  currentState: 'open' | 'closed' | 'unknown'
  lastTriggered: string | null
}

// Alarm Event
export interface AlarmEvent {
  id: number
  eventType: EventTypeType
  stateFrom: AlarmStateType | null
  stateTo: AlarmStateType | null
  timestamp: string
  userId: string | null
  codeId: number | null
  sensorId: number | null
  metadata: Record<string, unknown>
}

// Arm/Disarm Request
export interface ArmRequest {
  targetState: AlarmStateType
  code?: string
}

export interface DisarmRequest {
  code: string
}

// WebSocket Messages
export interface AlarmWebSocketMessage {
  type: 'alarm_state' | 'event' | 'countdown' | 'health'
  timestamp: string
  payload: AlarmStatePayload | AlarmEventPayload | CountdownPayload
  sequence: number
}

export interface AlarmStatePayload {
  state: AlarmStateSnapshot
  effectiveSettings: {
    delayTime: number
    armingTime: number
    triggerTime: number
  }
}

export interface AlarmEventPayload {
  event: AlarmEvent
}

export interface CountdownPayload {
  type: 'entry' | 'exit' | 'trigger'
  remainingSeconds: number
  totalSeconds: number
}
