import { API_BASE_URL, StorageKeys } from '@/lib/constants'
import type { ApiError } from '@/types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

function toCamelCaseKey(key: string): string {
  if (!key.includes('_')) return key
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toSnakeCaseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .replace(/__/g, '_')
    .toLowerCase()
}

function transformKeysDeep(value: unknown, transformKey: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => transformKeysDeep(item, transformKey))
  }
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    out[transformKey(key)] = transformKeysDeep(nested, transformKey)
  }
  return out
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem(StorageKeys.AUTH_TOKEN)
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const parsed = await response.json().catch(() => null)
      const error: ApiError = (() => {
        if (parsed && typeof parsed === 'object') {
          const asRecord = parsed as Record<string, unknown>
          const detail = typeof asRecord.detail === 'string' ? asRecord.detail : undefined
          const message = typeof asRecord.message === 'string' ? asRecord.message : detail
          return {
            message: message || response.statusText || 'An error occurred',
            code: typeof asRecord.code === 'string' ? asRecord.code : response.status.toString(),
            details:
              isPlainObject(asRecord.details) ? (asRecord.details as Record<string, string[]>) : undefined,
          }
        }
        return {
          message: response.statusText || 'An error occurred',
          code: response.status.toString(),
        }
      })()
      throw error
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T
    }

    const json = await response.json()
    return transformKeysDeep(json, toCamelCaseKey) as T
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      const snakeParams = transformKeysDeep(params, toSnakeCaseKey) as Record<
        string,
        string | number | boolean | undefined
      >
      Object.entries(snakeParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
    })

    return this.handleResponse<T>(response)
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: data ? JSON.stringify(transformKeysDeep(data, toSnakeCaseKey)) : undefined,
    })

    return this.handleResponse<T>(response)
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(transformKeysDeep(data, toSnakeCaseKey)),
    })

    return this.handleResponse<T>(response)
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(transformKeysDeep(data, toSnakeCaseKey)),
    })

    return this.handleResponse<T>(response)
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
    })

    return this.handleResponse<T>(response)
  }
}

export const api = new ApiClient()
export default api
