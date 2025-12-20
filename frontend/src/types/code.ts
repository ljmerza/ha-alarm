import type { AlarmStateType } from '@/lib/constants'

export type CodeType = 'permanent' | 'temporary' | 'one_time' | 'duress'

export interface AlarmCode {
  id: number
  userId: string
  userName: string // Denormalized for display
  name: string // e.g., "Main Code", "Dog Walker"
  codeType: CodeType
  isActive: boolean
  validFrom: string | null // ISO datetime
  validTo: string | null // ISO datetime
  daysOfWeek: number[] | null // 0=Sunday, 6=Saturday
  timeWindowStart: string | null // HH:MM
  timeWindowEnd: string | null // HH:MM
  maxUses: number | null
  currentUseCount: number
  allowedStates: AlarmStateType[] // States this code can arm to
  lastUsed: string | null
  createdAt: string
  modifiedAt: string
}

export interface CodeUsage {
  id: number
  codeId: number
  usedAt: string
  entryPointId: number | null
  entryPointName: string | null
  action: 'arm' | 'disarm' | 'unlock'
  success: boolean
  ipAddress: string | null
  userAgent: string | null
}

export interface CreateCodeRequest {
  userId: string
  name: string
  code: string // Plain text, will be hashed on server
  codeType: CodeType
  isActive?: boolean
  validFrom?: string
  validTo?: string
  daysOfWeek?: number[]
  timeWindowStart?: string
  timeWindowEnd?: string
  maxUses?: number
  allowedStates?: AlarmStateType[]
}

export interface UpdateCodeRequest {
  name?: string
  code?: string // Only if changing the code
  isActive?: boolean
  validFrom?: string | null
  validTo?: string | null
  daysOfWeek?: number[] | null
  timeWindowStart?: string | null
  timeWindowEnd?: string | null
  maxUses?: number | null
  allowedStates?: AlarmStateType[]
}

export interface ValidateCodeRequest {
  code: string
  action: 'arm' | 'disarm'
  targetState?: AlarmStateType
}

export interface ValidateCodeResponse {
  valid: boolean
  codeId: number | null
  userId: string | null
  reason?: string // e.g., "expired", "outside_time_window", "max_uses_exceeded"
}
