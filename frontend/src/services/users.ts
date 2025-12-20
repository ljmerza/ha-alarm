import api from './api'
import type { User } from '@/types'

export const usersService = {
  async listUsers(): Promise<User[]> {
    return api.get<User[]>('/api/users/')
  },
}

export default usersService

