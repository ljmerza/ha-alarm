import { useEffect, useState, useCallback } from 'react'
import { wsManager } from '@/services'
import type { AlarmWebSocketMessage, WebSocketStatus } from '@/types'

export function useWebSocket() {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected')

  useEffect(() => {
    const unsubscribe = wsManager.onStatusChange((newStatus) => {
      setStatus(newStatus)
    })

    return unsubscribe
  }, [])

  const connect = useCallback(() => {
    wsManager.connect()
  }, [])

  const disconnect = useCallback(() => {
    wsManager.disconnect()
  }, [])

  const send = useCallback((message: unknown) => {
    wsManager.send(message)
  }, [])

  return {
    status,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isDisconnected: status === 'disconnected',
    hasError: status === 'error',
    connect,
    disconnect,
    send,
  }
}

export function useWebSocketMessage(
  handler: (message: AlarmWebSocketMessage) => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const unsubscribe = wsManager.onMessage(handler)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export function useWebSocketStatus(
  handler: (status: WebSocketStatus) => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const unsubscribe = wsManager.onStatusChange(handler)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export default useWebSocket
