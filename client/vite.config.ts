import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Escucha en IPv4 e IPv6 (localhost, 127.0.0.1 y ::1) para que el navegador y las herramientas lleguen siempre.
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3200',
      '/uploads': 'http://localhost:3200',
    },
  },
});
