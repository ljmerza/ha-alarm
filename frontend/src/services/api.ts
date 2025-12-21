import { API_BASE_URL, StorageKeys } from '@/lib/constants'
import type { ApiError, PaginatedResponse } from '@/types'

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
  private refreshPromise: Promise<void> | null = null

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private resolveUrl(endpoint: string): string {
    if (this.baseUrl) {
      return `${this.baseUrl}${endpoint}`
    }
    if (typeof window === 'undefined') {
      return endpoint
    }
    return new URL(endpoint, window.location.origin).toString()
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem(StorageKeys.AUTH_TOKEN)
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private async refreshTokens(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    const refreshToken = localStorage.getItem(StorageKeys.REFRESH_TOKEN)
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    this.refreshPromise = (async () => {
      const response = await fetch(this.resolveUrl('/api/auth/token/refresh/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      })

      // If refresh fails, clear tokens so callers can treat as logged out
      if (!response.ok) {
        localStorage.removeItem(StorageKeys.AUTH_TOKEN)
        localStorage.removeItem(StorageKeys.REFRESH_TOKEN)
        throw new Error('Token refresh failed')
      }

      const json = await response.json().catch(() => ({}))
      const transformed = transformKeysDeep(json, toCamelCaseKey) as Record<string, unknown>
      const accessToken = typeof transformed.accessToken === 'string' ? transformed.accessToken : null
      const nextRefreshToken =
        typeof transformed.refreshToken === 'string' ? transformed.refreshToken : refreshToken

      if (!accessToken) {
        localStorage.removeItem(StorageKeys.AUTH_TOKEN)
        localStorage.removeItem(StorageKeys.REFRESH_TOKEN)
        throw new Error('Token refresh failed')
      }

      localStorage.setItem(StorageKeys.AUTH_TOKEN, accessToken)
      localStorage.setItem(StorageKeys.REFRESH_TOKEN, nextRefreshToken)
    })().finally(() => {
      this.refreshPromise = null
    })

    return this.refreshPromise
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined>
      data?: unknown
    }
  ): Promise<T> {
    const buildUrl = (): URL => {
      const url = new URL(this.resolveUrl(endpoint))
      if (options?.params) {
        const snakeParams = transformKeysDeep(options.params, toSnakeCaseKey) as Record<
          string,
          string | number | boolean | undefined
        >
        Object.entries(snakeParams).forEach(([key, value]) => {
          if (value !== undefined) url.searchParams.append(key, String(value))
        })
      }
      return url
    }

    const doFetch = async (): Promise<Response> => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      }
      return fetch(buildUrl().toString(), {
        method,
        headers,
        body:
          method === 'GET' || method === 'DELETE'
            ? undefined
            : options?.data
              ? JSON.stringify(transformKeysDeep(options.data, toSnakeCaseKey))
              : undefined,
      })
    }

    let response = await doFetch()

    const isUnauthorized = response.status === 401
    const canAttemptRefresh =
      isUnauthorized &&
      endpoint !== '/api/auth/login/' &&
      endpoint !== '/api/auth/logout/' &&
      endpoint !== '/api/auth/token/refresh/' &&
      !!localStorage.getItem(StorageKeys.REFRESH_TOKEN)

    if (canAttemptRefresh) {
      try {
        await this.refreshTokens()
        response = await doFetch()
      } catch {
        // fall through and let handleResponse surface the original/next error
      }
    }

    return this.handleResponse<T>(response)
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const parsed = await response.json().catch(() => null)
      const error: ApiError = (() => {
        if (parsed && typeof parsed === 'object') {
          const asRecord = parsed as Record<string, unknown>
          const detail = typeof asRecord.detail === 'string' ? asRecord.detail : undefined
          const message = typeof asRecord.message === 'string' ? asRecord.message : detail
          const fieldMessage = (() => {
            if (message) return undefined
            const nonField = asRecord.non_field_errors
            if (Array.isArray(nonField) && typeof nonField[0] === 'string') {
              return nonField[0]
            }
            for (const [key, value] of Object.entries(asRecord)) {
              if (key === 'detail' || key === 'message') continue
              if (Array.isArray(value) && typeof value[0] === 'string') {
                return `${key}: ${value[0]}`
              }
            }
            return undefined
          })()
          return {
            message: message || fieldMessage || response.statusText || 'An error occurred',
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
    return this.request<T>('GET', endpoint, { params })
  }

  async getData<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const response = await this.get<{ data: T }>(endpoint, params)
    return response.data
  }

  async getPaginated<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<PaginatedResponse<T>> {
    return this.get<PaginatedResponse<T>>(endpoint, params)
  }

  async getPaginatedItems<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T[]> {
    const response = await this.getPaginated<T>(endpoint, params)
    return response.data
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, { data })
  }

  async postData<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await this.post<{ data: T }>(endpoint, data)
    return response.data
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>('PUT', endpoint, { data })
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>('PATCH', endpoint, { data })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint)
  }
}

export const api = new ApiClient()
export default api
