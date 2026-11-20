import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import path from 'path';
import fs from 'fs';

/** The eight authored levels live in /levels; ship them with the build. */
function copyLevels() {
  return {
    name: 'copy-levels',
    apply: 'build' as const,
    closeBundle() {
      const source = path.resolve(__dirname, 'levels');
      const target = path.resolve(__dirname, 'dist/levels');
      if (!fs.existsSync(source)) return;
      fs.mkdirSync(target, { recursive: true });
      for (const file of fs.readdirSync(source)) {
        if (file.endsWith('.json')) {
          fs.copyFileSync(path.join(source, file), path.join(target, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [wasm(), copyLevels()],
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
