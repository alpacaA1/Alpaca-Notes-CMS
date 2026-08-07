import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { sourceAdminDir } from './build-paths'

export default defineConfig({
  base: '/Alpaca-Notes-CMS/admin/',
  build: {
    outDir: sourceAdminDir,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/foliate-js')) {
            return 'foliate-vendor'
          }
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'pdf-vendor'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  plugins: [react()],
})
