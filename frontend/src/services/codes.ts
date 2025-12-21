import api from './api'
import type {
  AlarmCode,
  CodeUsage,
  CreateCodeRequest,
  UpdateCodeRequest,
  ValidateCodeRequest,
  ValidateCodeResponse,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export const codesService = {
  async getCodes(params?: { userId?: string }): Promise<AlarmCode[]> {
    return api.get<AlarmCode[]>('/api/codes/', params)
  },

  async getCode(id: number): Promise<AlarmCode> {
    return api.get<AlarmCode>(`/api/codes/${id}/`)
  },

  async createCode(code: CreateCodeRequest): Promise<AlarmCode> {
    return api.post<AlarmCode>('/api/codes/', code)
  },

  async updateCode(id: number, code: UpdateCodeRequest): Promise<AlarmCode> {
    return api.patch<AlarmCode>(`/api/codes/${id}/`, code)
  },

  async deleteCode(id: number): Promise<void> {
    return api.delete(`/api/codes/${id}/`)
  },

  async getCodeUsage(
    id: number,
    params?: PaginationParams
  ): Promise<PaginatedResponse<CodeUsage>> {
    return api.getPaginated<CodeUsage>(`/api/codes/${id}/usage/`, params ? { ...params } : undefined)
  },

  async validateCode(request: ValidateCodeRequest): Promise<ValidateCodeResponse> {
    return api.post<ValidateCodeResponse>('/api/auth/validate-code/', request)
  },

  async deactivateCode(id: number): Promise<AlarmCode> {
    return api.patch<AlarmCode>(`/api/codes/${id}/`, { isActive: false })
  },

  async activateCode(id: number): Promise<AlarmCode> {
    return api.patch<AlarmCode>(`/api/codes/${id}/`, { isActive: true })
  },
}

export default codesService
