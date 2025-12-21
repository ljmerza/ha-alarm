import { Menu, Bell, User, LogOut, Moon, Sun, Monitor, House } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore, useUIStore } from '@/stores'
import { alarmService } from '@/services'
import { queryKeys } from '@/types'
import { useWebSocketStatus } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { AlarmStateLabels, AlarmState, Routes } from '@/lib/constants'

export function Header() {
  const { user, logout, isAuthenticated } = useAuthStore()
  const { toggleSidebar, theme, setTheme, isMobile } = useUIStore()

  const alarmStateQuery = useQuery({
    queryKey: queryKeys.alarm.state,
    queryFn: alarmService.getState,
    enabled: isAuthenticated,
  })
  const alarmState = alarmStateQuery.data ?? null

  const wsStatus = useWebSocketStatus().data

  const currentState = alarmState?.currentState ?? AlarmState.DISARMED

  const getStateBadgeVariant = () => {
    switch (currentState) {
      case AlarmState.DISARMED:
        return 'default'
      case AlarmState.TRIGGERED:
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      {/* Mobile Menu Button */}
      {isMobile && (
        <IconButton onClick={toggleSidebar} aria-label="Toggle menu">
          <Menu className="h-5 w-5" />
        </IconButton>
      )}

      {/* Home */}
      <IconButton asChild aria-label="Home">
        <Link to={Routes.HOME} aria-label="Home">
          <House className="h-5 w-5" />
        </Link>
      </IconButton>

      {/* Alarm Status Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={getStateBadgeVariant()} className="text-xs">
          {AlarmStateLabels[currentState]}
        </Badge>
        {wsStatus !== 'connected' && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {wsStatus === 'connecting' ? 'Connecting...' : 'Offline'}
          </Badge>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side controls */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <IconButton onClick={cycleTheme} aria-label="Toggle theme">
          <ThemeIcon className="h-5 w-5" />
        </IconButton>

        {/* Notifications */}
        <IconButton className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </IconButton>

        {/* User Menu */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden md:flex gap-2">
            <User className="h-4 w-4" />
            <span>{user?.displayName || 'User'}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

export default Header
