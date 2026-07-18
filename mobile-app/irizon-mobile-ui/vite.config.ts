// import { defineConfig } from "vite";
// import path from "path";
// import tailwindcss from "@tailwindcss/vite";
// import react from "@vitejs/plugin-react";

// export default defineConfig({
//   plugins: [react(), tailwindcss()],
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
//   assetsInclude: ["**/*.svg", "**/*.csv"],
// });


import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const tunnelHost = (process.env.VITE_DEV_TUNNEL_HOST || "").trim();

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    assetsInclude: ["**/*.svg", "**/*.csv"],

    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true as const,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
      hmr: tunnelHost
        ? {
            protocol: "wss",
            host: tunnelHost,
            clientPort: 443,
          }
        : undefined,
    },
  };
});
