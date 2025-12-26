import api from './api'
import type { DoorCode, CreateDoorCodeRequest, UpdateDoorCodeRequest } from '@/types'

export const doorCodesService = {
  async getDoorCodes(params?: { userId?: string }): Promise<DoorCode[]> {
    return api.get<DoorCode[]>('/api/door-codes/', params)
  },

  async getDoorCode(id: number): Promise<DoorCode> {
    return api.get<DoorCode>(`/api/door-codes/${id}/`)
  },

  async createDoorCode(req: CreateDoorCodeRequest): Promise<DoorCode> {
    return api.post<DoorCode>('/api/door-codes/', req)
  },

  async updateDoorCode(id: number, req: UpdateDoorCodeRequest): Promise<DoorCode> {
    return api.patch<DoorCode>(`/api/door-codes/${id}/`, req)
  },

  async deleteDoorCode(id: number, req: { reauthPassword: string }): Promise<void> {
    return api.delete(`/api/door-codes/${id}/`, req)
  },
}

export default doorCodesService
