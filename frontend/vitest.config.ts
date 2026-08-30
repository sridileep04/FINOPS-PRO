import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@/ui": fileURLToPath(new URL("./src/components/ui", import.meta.url)),
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        globals: true,
        css: false,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: ['node_modules/', 'src/test/', '**/*.d.ts', 'dist/'],
        },
    },
});