import api from './api'
import type { Sensor } from '@/types'

export const sensorsService = {
  async getSensors(): Promise<Sensor[]> {
    return api.get<Sensor[]>('/api/alarm/sensors/')
  },

  async getSensor(id: number): Promise<Sensor> {
    return api.get<Sensor>(`/api/alarm/sensors/${id}/`)
  },

  async createSensor(sensor: {
    name: string
    entityId: string | null
    isActive: boolean
    isEntryPoint: boolean
  }): Promise<Sensor> {
    return api.post<Sensor>('/api/alarm/sensors/', sensor)
  },

  async updateSensor(id: number, sensor: Partial<Sensor>): Promise<Sensor> {
    return api.patch<Sensor>(`/api/alarm/sensors/${id}/`, sensor)
  },

  async deleteSensor(id: number): Promise<void> {
    return api.delete(`/api/alarm/sensors/${id}/`)
  },
}

export default sensorsService

