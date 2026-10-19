import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(dirname, './src') } },
  /* Bind every interface, not just IPv6 loopback: vite's default left
     http://127.0.0.1:5175 refusing connections while http://[::1]:5175
     answered, so a browser that resolves localhost to IPv4 saw nothing.
     strictPort keeps the URL from moving when a stale server is running. */
  server: { host: true, port: 5175, strictPort: true },
})
