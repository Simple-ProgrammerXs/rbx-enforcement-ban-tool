import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const devHost = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const devPort = Number.parseInt(process.env.DASHBOARD_PORT ?? process.env.PORT ?? "3000", 10);

function printResolvedDevDashboardUrl(): Plugin {
  return {
    name: "print-resolved-dev-dashboard-url",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (address && typeof address === "object") {
          process.env.DASHBOARD_PORT = String(address.port);
          const displayHost = devHost === "0.0.0.0" || devHost === "::" ? "127.0.0.1" : devHost;
          process.stdout.write(
            `\n  Dashboard: http://${displayHost}:${address.port}/dashboard\n\n`,
          );
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
    printResolvedDevDashboardUrl(),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "bun" }),
    react(),
  ],
});
