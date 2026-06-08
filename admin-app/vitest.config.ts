import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['src/test/setup.ts'],
    environmentMatchGlobs: [
      ['src/**/*.test.ts', 'jsdom'],
      ['src/**/*.test.tsx', 'jsdom'],
    ],
    fileParallelism: false,
    include: ['scripts/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
