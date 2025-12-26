import api from './api'
import type { Rule, RuleRunResult, RuleSimulateRequest, RuleSimulateResult, RuleDefinition } from '@/types'

export const rulesService = {
  async list(params?: { kind?: Rule['kind']; enabled?: boolean }): Promise<Rule[]> {
    return api.get<Rule[]>('/api/alarm/rules/', params)
  },

  async run(): Promise<RuleRunResult> {
    return api.post<RuleRunResult>('/api/alarm/rules/run/', {})
  },

  async simulate(payload: RuleSimulateRequest): Promise<RuleSimulateResult> {
    return api.post<RuleSimulateResult>('/api/alarm/rules/simulate/', payload)
  },

  async create(rule: {
    name: string
    kind: Rule['kind']
    enabled: boolean
    priority: number
    schemaVersion: number
    definition: RuleDefinition
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
