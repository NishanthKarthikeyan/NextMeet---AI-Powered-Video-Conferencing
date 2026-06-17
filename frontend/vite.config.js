import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        secure: false,
      },
      '/local-ip': {
        target: 'http://127.0.0.1:8000',
        secure: false,
      }
    }
  },
})
