import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface UIStore {
  // Sidebar
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void

  // Modals
  activeModal: string | null
  modalData: unknown
  openModal: (modal: string, data?: unknown) => void
  closeModal: () => void

  // Toast/Notifications
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void

  // Mobile
  isMobile: boolean
  setIsMobile: (isMobile: boolean) => void
}

interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Sidebar
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // Theme
      theme: 'system',
      setTheme: (theme) => {
        set({ theme })
        // Apply theme to document
        const root = document.documentElement
        root.classList.remove('light', 'dark')
        if (theme === 'system') {
          const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          root.classList.add(systemTheme)
        } else {
          root.classList.add(theme)
        }
      },

      // Modals
      activeModal: null,
      modalData: null,
      openModal: (modal, data) => set({ activeModal: modal, modalData: data }),
      closeModal: () => set({ activeModal: null, modalData: null }),

      // Toasts
      toasts: [],
      addToast: (toast) => {
        const id = Math.random().toString(36).slice(2, 9)
        const newToast = { ...toast, id }
        set({ toasts: [...get().toasts, newToast] })

        // Auto-remove after duration
        const duration = toast.duration ?? 5000
        if (duration > 0) {
          setTimeout(() => {
            get().removeToast(id)
          }, duration)
        }
      },
      removeToast: (id) => {
        set({ toasts: get().toasts.filter((t) => t.id !== id) })
      },
      clearToasts: () => set({ toasts: [] }),

      // Mobile
      isMobile: false,
      setIsMobile: (isMobile) => set({ isMobile }),
    }),
    {
      name: 'alarm-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
)

export default useUIStore
