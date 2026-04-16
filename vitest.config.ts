import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    env: {
      DNIS_PRIMARY: '16135949199',
      DNIS_SECONDARY: '6135949199',
    },
  },
})
