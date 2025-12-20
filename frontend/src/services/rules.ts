import api from './api'
import type { Rule } from '@/types'

export const rulesService = {
  async list(params?: { kind?: Rule['kind']; enabled?: boolean }): Promise<Rule[]> {
    return api.get<Rule[]>('/api/alarm/rules/', params)
  },

  async run(): Promise<{
    evaluated: number
    fired: number
    scheduled: number
    skippedCooldown: number
    errors: number
  }> {
    return api.post<{
      evaluated: number
      fired: number
      scheduled: number
      skippedCooldown: number
      errors: number
    }>('/api/alarm/rules/run/', {})
  },

  async simulate(payload: {
    entityStates: Record<string, string>
    assumeForSeconds?: number
  }): Promise<{
    timestamp: string
    summary: { evaluated: number; matched: number; wouldSchedule: number }
    matchedRules: Array<{
      id: number
      name: string
      kind: Rule['kind']
      priority: number
      matched: boolean
      for?: { seconds: number; status: string; assumedForSeconds?: number }
      trace: Record<string, unknown>
      actions: unknown[]
    }>
    nonMatchingRules: Array<{
      id: number
      name: string
      kind: Rule['kind']
      priority: number
      matched: boolean
      trace: Record<string, unknown>
      actions: unknown[]
    }>
  }> {
    return api.post('/api/alarm/rules/simulate/', {
      entityStates: payload.entityStates,
      assumeForSeconds: payload.assumeForSeconds,
    })
  },

  async create(rule: {
    name: string
    kind: Rule['kind']
    enabled: boolean
    priority: number
    schemaVersion: number
    definition: Record<string, unknown>
    cooldownSeconds?: number | null
    entityIds?: string[]
  }): Promise<Rule> {
    return api.post<Rule>('/api/alarm/rules/', rule)
  },

  async update(id: number, rule: Partial<Omit<Rule, 'id'>>): Promise<Rule> {
    return api.patch<Rule>(`/api/alarm/rules/${id}/`, rule)
  },

  async delete(id: number): Promise<void> {
    return api.delete(`/api/alarm/rules/${id}/`)
  },
}

export default rulesService
