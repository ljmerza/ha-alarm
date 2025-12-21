import { useQuery } from '@tanstack/react-query'
import { homeAssistantService } from '@/services'
import { useAuthStore } from '@/stores'
import { queryKeys } from '@/types'

export function useHomeAssistantStatus() {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.homeAssistant.status,
    queryFn: homeAssistantService.getStatus,
    enabled: isAuthenticated,
  })
}

export function useHomeAssistantEntities() {
  const { isAuthenticated } = useAuthStore()
  const statusQuery = useHomeAssistantStatus()
  const enabled = !!isAuthenticated && !!statusQuery.data?.configured && !!statusQuery.data?.reachable

  return useQuery({
    queryKey: queryKeys.homeAssistant.entities,
    queryFn: homeAssistantService.listEntities,
    enabled,
  })
}

export default useHomeAssistantStatus

