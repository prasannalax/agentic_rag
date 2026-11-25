import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/agentic_rag/',
  server: {
    proxy: {
      '/api': {
        target: 'https://agentic-rag-1-35v8.onrender.com',
        changeOrigin: true,
      },
    },
  },
})