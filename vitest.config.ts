import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const r = (p: string): string => resolve(__dirname, p)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': r('src/renderer/src'),
      '@worker': r('src/renderer/src/components/worker'),
      '@store': r('src/renderer/src/store'),
      '@utils': r('src/renderer/src/utils'),
      '@shared': r('src/main/shared'),
      '@main': r('src/main')
    }
  },
  define: {
    __BUILD_SHA__: JSON.stringify(process.env.BUILD_SHA ?? 'dev'),
    __BUILD_RUN__: JSON.stringify(process.env.BUILD_RUN ?? ''),
    __BUILD_BRANCH__: JSON.stringify(process.env.BUILD_BRANCH ?? '')
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    // import-heavy tests (await import after resetModules) can exceed the 5s default under load
    testTimeout: 15000,
    // @mui ships ESM with directory imports Node cannot resolve when externalized, let Vite handle it
    server: { deps: { inline: [/@mui\//] } }
  }
})
