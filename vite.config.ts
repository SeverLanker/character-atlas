import { atlasAgent } from "./scripts/agent-vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react(), atlasAgent()],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true, watch: { ignored: ["**/deliverables/**", "**/.agent/**"] }, fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.agent/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: "es2022" },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
