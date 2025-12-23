import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { wsManager } from '@/services'
import type { AlarmEvent, AlarmWebSocketMessage, WebSocketStatus } from '@/types'
import { queryKeys } from '@/types'
import { useAuthSessionQuery } from '@/hooks/useAuthQueries'
import { isAlarmStatePayload, isAlarmEventPayload, isCountdownPayload } from '@/lib/typeGuards'

let unsubscribeMessages: (() => void) | null = null
let unsubscribeStatus: (() => void) | null = null

function upsertRecentEvent(prev: AlarmEvent[] | undefined, nextEvent: AlarmEvent): AlarmEvent[] {
  const existing = Array.isArray(prev) ? prev : []
  const without = existing.filter((e) => e.id !== nextEvent.id)
  return [nextEvent, ...without].slice(0, 10)
}

export function AlarmRealtimeProvider() {
  const queryClient = useQueryClient()
  const sessionQuery = useAuthSessionQuery()
  const isAuthenticated = sessionQuery.data.isAuthenticated

  useEffect(() => {
    if (!isAuthenticated) {
      wsManager.disconnect()
      queryClient.setQueryData(queryKeys.websocket.status, 'disconnected' as WebSocketStatus)
      if (unsubscribeMessages) {
        unsubscribeMessages()
        unsubscribeMessages = null
      }
      if (unsubscribeStatus) {
        unsubscribeStatus()
        unsubscribeStatus = null
      }
      queryClient.setQueryData(queryKeys.alarm.countdown, null)
      return
    }

    if (!unsubscribeStatus) {
      unsubscribeStatus = wsManager.onStatusChange((status) => {
        queryClient.setQueryData(queryKeys.websocket.status, status)
      })
    }

    if (!unsubscribeMessages) {
      unsubscribeMessages = wsManager.onMessage((message: AlarmWebSocketMessage) => {
        switch (message.type) {
          case 'alarm_state': {
            // Discriminated union narrows payload type, but validate at runtime for safety
            if (!isAlarmStatePayload(message.payload)) {
              console.error('Invalid alarm_state payload', message.payload)
              break
            }
            queryClient.setQueryData(queryKeys.alarm.state, message.payload.state)
            break
          }
          case 'event': {
            if (!isAlarmEventPayload(message.payload)) {
              console.error('Invalid event payload', message.payload)
              break
            }
            queryClient.setQueryData(queryKeys.events.recent, (prev) =>
              upsertRecentEvent(prev as AlarmEvent[] | undefined, message.payload.event)
            )
            break
          }
          case 'countdown': {
            if (!isCountdownPayload(message.payload)) {
              console.error('Invalid countdown payload', message.payload)
              break
            }
            queryClient.setQueryData(queryKeys.alarm.countdown, message.payload)
            break
          }
          case 'health':
            // Health messages received but not processed yet
            break
        }
      })
    }

    wsManager.connect()

    return () => {
      wsManager.disconnect()
      queryClient.setQueryData(queryKeys.websocket.status, 'disconnected' as WebSocketStatus)
      if (unsubscribeMessages) {
        unsubscribeMessages()
        unsubscribeMessages = null
      }
      if (unsubscribeStatus) {
        unsubscribeStatus()
        unsubscribeStatus = null
      }
      queryClient.setQueryData(queryKeys.alarm.countdown, null)
    }
  }, [isAuthenticated, queryClient])

  return null
}

export default AlarmRealtimeProvider
