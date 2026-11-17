import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import path from 'path';

export default defineConfig({
  plugins: [wasm()],
  server: {
    port: 5173,
    host: true,
    // Serve the editor at /editor as well as /editor.html.
    configureServer: (server) => {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/editor') {
          req.url = '/editor.html';
        }
        next();
      });
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        editor: path.resolve(__dirname, 'editor.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
