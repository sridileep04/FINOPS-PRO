import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@/ui": fileURLToPath(new URL("./src/components/ui", import.meta.url)),
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: fileURLToPath(new URL("./dist", import.meta.url)),
      emptyOutDir: true,
      chunkSizeWarningLimit: 200,
      rollupOptions: {
        output: {
          // Rolldown (used by this Vite version) requires manualChunks to
          // be a function, not the old Rollup-style { chunkName: [ids] }
          // object -- return a chunk name to group a module into it, or
          // undefined/nothing to let Rolldown decide.
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (/[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
                return 'vendor';
              }
              if (/[\\/](echarts|echarts-for-react)[\\/]/.test(id)) {
                return 'charts';
              }
              if (id.includes('motion')) {
                return 'motion';
              }
              if (id.includes('lucide-react')) {
                return 'icons';
              }
            }
          },
        }
      }
    }
  };
});