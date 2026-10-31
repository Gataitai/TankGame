import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: {
        alias: {
            // Two independent games in one repo; neither source folder imports from the other.
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "@2": fileURLToPath(new URL("./src2", import.meta.url)),
        },
    },
    build: {
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL("./index.html", import.meta.url)),
                sandbox: fileURLToPath(new URL("./sandbox.html", import.meta.url)),
            },
        },
    },
});
