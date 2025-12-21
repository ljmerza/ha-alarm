import { useQuery } from '@tanstack/react-query'
import { homeAssistantService } from '@/services'
import { queryKeys } from '@/types'
import { useAuthSessionQuery } from '@/hooks/useAuthQueries'

export function useHomeAssistantStatus() {
  const session = useAuthSessionQuery()
  const isAuthenticated = session.data.isAuthenticated
  return useQuery({
    queryKey: queryKeys.homeAssistant.status,
    queryFn: homeAssistantService.getStatus,
    enabled: isAuthenticated,
  })
}

export function useHomeAssistantEntities() {
  const session = useAuthSessionQuery()
  const isAuthenticated = session.data.isAuthenticated
  const statusQuery = useHomeAssistantStatus()
  const enabled = !!isAuthenticated && !!statusQuery.data?.configured && !!statusQuery.data?.reachable

  return useQuery({
    queryKey: queryKeys.homeAssistant.entities,
    queryFn: homeAssistantService.listEntities,
    enabled,
  })
}

export default useHomeAssistantStatus
