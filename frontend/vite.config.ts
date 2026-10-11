import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react()],

    server: {
      host: '0.0.0.0',
      port: 3000,

      allowedHosts: [
        'modify-fares-lake-bass.trycloudflare.com',
        'car-parts-platform-xivy.onrender.com'
      ],

      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
        // Proxy uploaded media (logo, product/category images, avatars) the
        // same way /api is proxied. Belt-and-suspenders alongside
        // resolveImageUrl() in src/utils/image.ts: that helper already
        // points <img> tags straight at the backend origin, but proxying
        // /static too means any code that still builds a bare relative
        // "/static/..." URL (new code, a third-party component, etc.)
        // keeps working in dev instead of silently 404ing again.
        '/static': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})