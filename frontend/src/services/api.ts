import { API_BASE_URL } from '@/lib/constants'
import type { ApiError, PaginatedResponse } from '@/types'
import { isRecord } from '@/lib/typeGuards'
import { isApiErrorResponse, getApiErrorMessage } from '@/types/errors'

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

function getCookieValue(cookieName: string): string | null {
  if (typeof document === 'undefined') return null
  const cookies = document.cookie ? document.cookie.split('; ') : []
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=')
    if (name === cookieName) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

class ApiClient {
  private baseUrl: string
  private csrfPromise: Promise<void> | null = null

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

  private async ensureCsrfCookie(): Promise<void> {
    if (this.csrfPromise) return this.csrfPromise

    this.csrfPromise = fetch(this.resolveUrl('/api/auth/csrf/'), {
      method: 'GET',
      credentials: 'include',
    })
      .then(() => undefined)
      .finally(() => {
        this.csrfPromise = null
      })

    return this.csrfPromise
  }

  private async getCsrfToken(): Promise<string | null> {
    const existing = getCookieValue('csrftoken')
    if (existing) return existing
    await this.ensureCsrfCookie()
    return getCookieValue('csrftoken')
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
      const csrfHeader =
        method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
          ? { 'X-CSRFToken': (await this.getCsrfToken()) || '' }
          : {}
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...csrfHeader,
      }
      return fetch(buildUrl().toString(), {
        method,
        headers,
        credentials: 'include',
        body:
          method === 'GET'
            ? undefined
            : options?.data
              ? JSON.stringify(transformKeysDeep(options.data, toSnakeCaseKey))
              : undefined,
      })
    }

    return this.handleResponse<T>(await doFetch())
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const parsed = await response.json().catch(() => null)
      const error: ApiError = (() => {
        if (isApiErrorResponse(parsed)) {
          const message = getApiErrorMessage(parsed)
          const code = isRecord(parsed) && typeof parsed.code === 'string'
            ? parsed.code
            : response.status.toString()
          const details = isRecord(parsed) && isRecord(parsed.details)
            ? (parsed.details as Record<string, string[]>)
            : undefined

          return { message, code, details }
        }
        return {
          message: response.statusText || 'An error occurred',
          code: response.status.toString(),
        }
      })()
      throw error
    }

    // Handle 204 No Content - return undefined for empty responses
    // Note: This may cause type issues if T expects an object. Callers should handle this.
    if (response.status === 204) {
      return undefined as T
    }

    const json = await response.json()
    const transformed = transformKeysDeep(json, toCamelCaseKey)

    // Type safety note: We trust that the API returns data matching type T
    // For additional safety, callers can use validation functions
    return transformed as T
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

  async delete<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>('DELETE', endpoint, { data })
  }
}

export const api = new ApiClient()
export default api
