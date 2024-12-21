// vite.config.js or vite.config.ts
import { defineConfig } from 'vite';
import * as path from 'path';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    plugins: [wasm()],
    // ...other configurations
});
