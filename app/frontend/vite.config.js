import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración de Vite para producción detrás del API Gateway
export default defineConfig({
  plugins: [react()],
  base: '/activos/',
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://backend-activos:4002',
        changeOrigin: true,
      },
    },
  },
})
