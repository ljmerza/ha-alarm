import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

function isRunningInDocker(): boolean {
  return fs.existsSync('/.dockerenv')
}

function toWebSocketTarget(httpTarget: string): string {
  if (httpTarget.startsWith('https://')) return httpTarget.replace('https://', 'wss://')
  if (httpTarget.startsWith('http://')) return httpTarget.replace('http://', 'ws://')
  return httpTarget
}

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ??
  (isRunningInDocker() ? 'http://web:8000' : 'http://localhost:5427')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: toWebSocketTarget(apiProxyTarget),
        ws: true,
      },
    },
  },
})
