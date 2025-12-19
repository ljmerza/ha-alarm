import { WS_BASE_URL, StorageKeys } from '@/lib/constants'
import type { AlarmWebSocketMessage, WebSocketStatus } from '@/types'

type MessageHandler = (message: AlarmWebSocketMessage) => void
type StatusHandler = (status: WebSocketStatus) => void

class WebSocketManager {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private messageHandlers: Set<MessageHandler> = new Set()
  private statusHandlers: Set<StatusHandler> = new Set()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private status: WebSocketStatus = 'disconnected'

  constructor(baseUrl: string = WS_BASE_URL) {
    // Convert http(s) to ws(s) if needed
    const wsUrl = baseUrl.replace(/^http/, 'ws')
    this.url = wsUrl || `ws://${window.location.host}`
  }

  private getAuthToken(): string | null {
    return localStorage.getItem(StorageKeys.AUTH_TOKEN)
  }

  private setStatus(status: WebSocketStatus): void {
    this.status = status
    this.statusHandlers.forEach((handler) => handler(status))
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    const token = this.getAuthToken()
    const wsUrl = token
      ? `${this.url}/ws/alarm/?token=${encodeURIComponent(token)}`
      : `${this.url}/ws/alarm/`

    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.setStatus('connected')
        this.reconnectAttempts = 0
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: AlarmWebSocketMessage = JSON.parse(event.data)
          this.messageHandlers.forEach((handler) => handler(message))
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = () => {
        this.setStatus('error')
      }

      this.ws.onclose = () => {
        this.setStatus('disconnected')
        this.stopHeartbeat()
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      this.setStatus('error')
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    )

    this.reconnectAttempts++

    setTimeout(() => {
      if (this.status !== 'connected') {
        this.connect()
      }
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000) // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    // Immediately call with current status
    handler(this.status)
    return () => this.statusHandlers.delete(handler)
  }

  getStatus(): WebSocketStatus {
    return this.status
  }

  isConnected(): boolean {
    return this.status === 'connected'
  }
}

export const wsManager = new WebSocketManager()
export default wsManager
