import api from './api'
import type { Entity } from '@/types'

export const entitiesService = {
  async list(): Promise<Entity[]> {
    return api.get<Entity[]>('/api/alarm/entities/')
  },

  async sync(): Promise<{ imported: number; updated: number; timestamp: string }> {
    return api.post<{ imported: number; updated: number; timestamp: string }>('/api/alarm/entities/sync/', {})
  },
}

export default entitiesService

