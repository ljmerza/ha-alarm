import type { LucideIcon } from 'lucide-react'
import { Shield, Gavel, Key, Clock, DoorClosed, Settings } from 'lucide-react'
import { Routes } from '@/lib/constants'

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { path: Routes.HOME, label: 'Dashboard', icon: Shield },
  { path: Routes.RULES, label: 'Rules', icon: Gavel },
  { path: Routes.CODES, label: 'Codes', icon: Key },
  { path: Routes.DOOR_CODES, label: 'Door Codes', icon: DoorClosed },
  { path: Routes.EVENTS, label: 'Events', icon: Clock },
  { path: Routes.SETTINGS, label: 'Settings', icon: Settings },
]
