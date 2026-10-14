import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    env: { TZ: 'Asia/Tokyo' },
    restoreMocks: true,
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
})
