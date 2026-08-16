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
      rollupOptions: {
        output: {
          manualChunks: {
            // Split vendor dependencies into separate chunks
            vendor: ['react', 'react-dom', 'react-router-dom'],
            charts: ['echarts', 'echarts-for-react'],
            motion: ['motion/react'],
            icons: ['lucide-react'],
          },
          chunkSizeWarningLimit: 200,
        }
      }
    }
  };
});