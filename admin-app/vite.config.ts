import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const outputDir = resolve(__dirname, '..', 'source', 'admin')

export default defineConfig({
  base: '/admin/',
  build: {
    outDir: outputDir,
    emptyOutDir: false,
  },
  plugins: [
    react(),
    {
      name: 'clean-admin-output',
      buildStart() {
        rmSync(outputDir, { recursive: true, force: true })
      },
    },
  ],
})
