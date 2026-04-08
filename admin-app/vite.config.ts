import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { sourceAdminDir } from './build-paths'

export default defineConfig({
  base: '/Alpaca-Notes-CMS/admin/',
  build: {
    outDir: sourceAdminDir,
    emptyOutDir: true,
  },
  plugins: [react()],
})
