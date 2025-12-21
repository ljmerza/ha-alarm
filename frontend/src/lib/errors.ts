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

