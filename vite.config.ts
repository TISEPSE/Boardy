import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Port fixe : `tauri.conf.json` pointe dessus via `devUrl`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Le dossier Rust est surveillé par `tauri dev`, pas par Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
});
