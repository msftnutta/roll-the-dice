import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createGameApiMiddleware } from './src/server/http-server.js';
import { attachRoomServer } from './src/server/socket-server.js';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dice-game-api',
      configureServer(server) {
        server.middlewares.use(createGameApiMiddleware());
        attachRoomServer(server.httpServer);
      },
    },
  ],
});
