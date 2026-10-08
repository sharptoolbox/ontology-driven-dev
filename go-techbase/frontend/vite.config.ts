import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:9680',
        changeOrigin: true,
        secure: false, // 目标为自签证书环境(如生产 Traefik 默认证书)时允许代理转发
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
