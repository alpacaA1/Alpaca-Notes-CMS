import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['src/**/*.test.ts', 'jsdom'],
      ['src/**/*.test.tsx', 'jsdom'],
    ],
    include: ['scripts/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
