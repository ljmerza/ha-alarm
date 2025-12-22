import api from './api'
import type { SystemConfigRow } from '@/types'

export const systemConfigService = {
  async list(): Promise<SystemConfigRow[]> {
    return api.get<SystemConfigRow[]>('/api/system-config/')
  },

  async update(key: string, changes: { value?: unknown; description?: string }): Promise<SystemConfigRow> {
    return api.patch<SystemConfigRow>(`/api/system-config/${encodeURIComponent(key)}/`, changes)
  },
}

export default systemConfigService
