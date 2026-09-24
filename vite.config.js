import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createGameApiMiddleware } from './src/server/http-server.js';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dice-game-api',
      configureServer(server) {
        server.middlewares.use(createGameApiMiddleware());
      },
    },
  ],
});
