import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const devHost = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const devPort = Number.parseInt(process.env.DASHBOARD_PORT ?? process.env.PORT ?? "3000", 10);

function exposeResolvedDevServerPort(): Plugin {
  return {
    name: "expose-resolved-dev-server-port",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (address && typeof address === "object") {
          process.env.DASHBOARD_PORT = String(address.port);
        }
      });
    },
  };
}

export default defineConfig({
  oxc: {
    jsx: {
      development: false,
    },
  },
  server: {
    host: devHost,
    port: Number.isInteger(devPort) ? devPort : 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    exposeResolvedDevServerPort(),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "bun" }),
    react(),
  ],
});
