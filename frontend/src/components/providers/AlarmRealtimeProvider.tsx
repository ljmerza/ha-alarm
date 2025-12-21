import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { wsManager } from '@/services'
import type { AlarmEvent, AlarmStateSnapshot, CountdownPayload, AlarmWebSocketMessage, WebSocketStatus } from '@/types'
import { queryKeys } from '@/types'
import { useAuthSessionQuery } from '@/hooks/useAuthQueries'

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
          case 'alarm_state':
            queryClient.setQueryData(
              queryKeys.alarm.state,
              (message.payload as { state: AlarmStateSnapshot }).state
            )
            break
          case 'event':
            queryClient.setQueryData(queryKeys.events.recent, (prev) =>
              upsertRecentEvent(prev as AlarmEvent[] | undefined, (message.payload as { event: AlarmEvent }).event)
            )
            break
          case 'countdown':
            queryClient.setQueryData(queryKeys.alarm.countdown, message.payload as CountdownPayload)
            break
          case 'health':
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
