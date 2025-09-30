import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Match the port expected by Tauri
    strictPort: true, // Fail if port is already in use
  },
  define: {
    // Only expose specific environment variables that are safe for the frontend
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.VITE_APP_TITLE': JSON.stringify(process.env.VITE_APP_TITLE || 'Macro'),
  }
})
