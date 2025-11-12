import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Toute requête locale vers /api/* sera proxifiée vers ta prod
      '/api': {
        target: 'https://boostyourlife.coach',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})

