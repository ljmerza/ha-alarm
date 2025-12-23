import type { ApiError } from '@/types'

/**
 * Error categories for different handling strategies
 */
export type ErrorCategory =
  | 'auth' // 401/403 - redirect to login
  | 'validation' // 400/422 - show field errors
  | 'not_found' // 404 - show not found message
  | 'network' // Network failures - show connection error
  | 'server' // 500+ - show server error
  | 'timeout' // Request timeout
  | 'unknown' // Fallback

/**
 * Structured error with category and metadata
 */
export interface AppError {
  category: ErrorCategory
  message: string
  code?: string
  details?: Record<string, string[]>
  originalError?: unknown
  timestamp: number
  recoverable: boolean
}

/**
 * Type guard for API errors
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  )
}

/**
 * Type guard for network errors
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return error.message.includes('fetch') || error.message.includes('network')
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false // Intentional abort, not a network error
  }
  return false
}

/**
 * Type guard for timeout errors
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Categorize any error into an AppError
 */
export function categorizeError(error: unknown): AppError {
  const timestamp = Date.now()

  // Network errors
  if (isNetworkError(error)) {
    return {
      category: 'network',
      message: 'Unable to connect to the server. Check your connection.',
      recoverable: true,
      timestamp,
      originalError: error,
    }
  }

  // Timeout errors
  if (isTimeoutError(error)) {
    return {
      category: 'timeout',
      message: 'Request timed out. Please try again.',
      recoverable: true,
      timestamp,
      originalError: error,
    }
  }

  // API errors with status codes
  if (isApiError(error)) {
    const code = parseInt(error.code || '0', 10)

    if (code === 401 || code === 403) {
      return {
        category: 'auth',
        message:
          code === 401
            ? 'Session expired. Please log in again.'
            : 'You do not have permission to perform this action.',
        code: error.code,
        recoverable: false,
        timestamp,
        originalError: error,
      }
    }

    if (code === 404) {
      return {
        category: 'not_found',
        message: error.message || 'The requested resource was not found.',
        code: error.code,
        recoverable: false,
        timestamp,
        originalError: error,
      }
    }

    if (code === 400 || code === 422) {
      return {
        category: 'validation',
        message: error.message || 'Please check your input and try again.',
        code: error.code,
        details: error.details,
        recoverable: true,
        timestamp,
        originalError: error,
      }
    }

    if (code >= 500) {
      return {
        category: 'server',
        message: 'The server encountered an error. Please try again later.',
        code: error.code,
        recoverable: true,
        timestamp,
        originalError: error,
      }
    }

    // API error without recognizable code
    return {
      category: 'unknown',
      message: error.message || 'An unexpected error occurred.',
      code: error.code,
      details: error.details,
      recoverable: true,
      timestamp,
      originalError: error,
    }
  }

  // Standard Error objects
  if (error instanceof Error) {
    return {
      category: 'unknown',
      message: error.message || 'An unexpected error occurred.',
      recoverable: true,
      timestamp,
      originalError: error,
    }
  }

  // Unknown error type
  return {
    category: 'unknown',
    message: 'An unexpected error occurred.',
    recoverable: true,
    timestamp,
    originalError: error,
  }
}

/**
 * Get user-friendly error message (legacy compatibility)
 */
export function getErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined

  if (typeof error === 'string') return error

  if (error instanceof Error) {
    return error.message || undefined
  }

  if (typeof error !== 'object') return undefined

  const asRecord = error as Record<string, unknown>
  const detail = typeof asRecord.detail === 'string' ? asRecord.detail : undefined
  const message = typeof asRecord.message === 'string' ? asRecord.message : undefined

  return detail || message
}
