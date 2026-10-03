import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Carga por página (React.lazy en App.tsx) + React en su propio trozo: el primer arranque es más ligero.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Solo React y el router van aparte (cambian poco y se cachean un año). El resto lo reparte Vite por
          // página: trocear a mano las librerías de gráficos crea dependencias circulares entre trozos.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
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
