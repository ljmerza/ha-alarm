import { Outlet } from 'react-router-dom'
import { useUIStore } from '@/stores'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileNav } from './MobileNav'

export function AppShell() {
  const { sidebarOpen, sidebarCollapsed, isMobile } = useUIStore()

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}

      {/* Main Content */}
      <div
        className={cn(
          'flex flex-col transition-all duration-300',
          !isMobile && sidebarOpen && !sidebarCollapsed && 'lg:ml-64',
          !isMobile && sidebarOpen && sidebarCollapsed && 'lg:ml-16'
        )}
      >
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileNav />}
    </div>
  )
}

export default AppShell
