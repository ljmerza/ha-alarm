import api from './api'
import type { Zone, Sensor } from '@/types'

export const zonesService = {
  // Zones
  async getZones(): Promise<Zone[]> {
    return api.get<Zone[]>('/api/alarm/zones/')
  },

  async getZone(id: number): Promise<Zone> {
    return api.get<Zone>(`/api/alarm/zones/${id}/`)
  },

  async createZone(zone: Omit<Zone, 'id' | 'sensors' | 'isBypassed' | 'bypassedUntil'>): Promise<Zone> {
    return api.post<Zone>('/api/alarm/zones/', zone)
  },

  async updateZone(id: number, zone: Partial<Zone>): Promise<Zone> {
    return api.patch<Zone>(`/api/alarm/zones/${id}/`, zone)
  },

  async deleteZone(id: number): Promise<void> {
    return api.delete(`/api/alarm/zones/${id}/`)
  },

  async bypassZone(id: number, until?: string): Promise<Zone> {
    return api.patch<Zone>(`/api/alarm/zones/${id}/bypass/`, { until })
  },

  async unbypassZone(id: number): Promise<Zone> {
    return api.patch<Zone>(`/api/alarm/zones/${id}/unbypass/`, {})
  },

  // Sensors
  async getSensors(zoneId?: number): Promise<Sensor[]> {
    const params = zoneId ? { zone: zoneId } : undefined
    return api.get<Sensor[]>('/api/alarm/sensors/', params)
  },

  async getSensor(id: number): Promise<Sensor> {
    return api.get<Sensor>(`/api/alarm/sensors/${id}/`)
  },

  async createSensor(sensor: Omit<Sensor, 'id' | 'currentState' | 'lastTriggered'>): Promise<Sensor> {
    return api.post<Sensor>('/api/alarm/sensors/', sensor)
  },

  async updateSensor(id: number, sensor: Partial<Sensor>): Promise<Sensor> {
    return api.patch<Sensor>(`/api/alarm/sensors/${id}/`, sensor)
  },

  async deleteSensor(id: number): Promise<void> {
    return api.delete(`/api/alarm/sensors/${id}/`)
  },
}

export default zonesService
