import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: "0.0.0.0",
        port: 5173,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8000",
                changeOrigin: true,
                secure: false,
            },
            "/ws": {
                target: "ws://127.0.0.1:8000",
                ws: true,
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: "dist",
        sourcemap: false,
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ["react", "react-dom"],
                    router: ["react-router-dom"],
                    query: ["@tanstack/react-query"],
                    echarts: ["echarts-for-react", "echarts"],
                    xterm: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links"],
                    ui: [
                        "@radix-ui/react-dialog",
                        "@radix-ui/react-dropdown-menu",
                        "@radix-ui/react-tabs",
                        "@radix-ui/react-toast",
                    ],
                },
            },
        },
    },
});
