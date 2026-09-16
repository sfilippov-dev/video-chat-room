import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_TARGET = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Сигналинг идёт через тот же origin, что и страница: в разработке Vite
      // проксирует WebSocket на Node-сервер, в production статику отдаёт он сам.
      '/socket.io': { target: SERVER_TARGET, ws: true },
      '/healthz': { target: SERVER_TARGET },
    },
  },
  build: {
    outDir: 'dist',
  },
});
