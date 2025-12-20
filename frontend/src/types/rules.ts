export type RuleKind = 'trigger' | 'disarm' | 'arm' | 'suppress' | 'escalate'

export interface Entity {
  id: number
  entityId: string
  domain: string
  name: string
  deviceClass: string | null
  lastState: string | null
  lastChanged: string | null
  lastSeen: string | null
  attributes: Record<string, unknown>
  source: string
  createdAt: string
  updatedAt: string
}

export interface Rule {
  id: number
  name: string
  kind: RuleKind
  enabled: boolean
  priority: number
  schemaVersion: number
  definition: Record<string, unknown>
  cooldownSeconds: number | null
  entityIds: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

