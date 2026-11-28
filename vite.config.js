import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @returns {import('vite').Plugin} */
function svelteEmptyStyleFallbackPlugin() {
  return {
    name: "svelte-empty-style-fallback",
    enforce: "post",
    /** @param {string} id */
    load(id) {
      if (id.includes("type=style") && (id.includes("svelte") || id.includes(".svelte"))) {
        return "";
      }
    },
  };
}

// @ts-ignore process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const isDevArg = process.argv.some(
  (arg) => arg === '--development' || arg === '-d' || arg === '--dev'
);
/** @type {Record<string, string>} */
let fileEnv = {};
try {
  // @ts-ignore process is a nodejs global
  fileEnv = loadEnv('development', process.cwd(), '');
} catch {}
const isEnvDev =
  process.env.DEVELOPMENT === 'true' ||
  process.env.VITE_ENABLE_DEV_WEBCAM === 'true' ||
  fileEnv['DEVELOPMENT'] === 'true' ||
  fileEnv['VITE_ENABLE_DEV_WEBCAM'] === 'true';
const isDevWebcam = isDevArg || isEnvDev;
if (isDevWebcam) {
  process.env.VITE_ENABLE_DEV_WEBCAM = 'true';
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  envPrefix: ['VITE_', 'PUBLIC_', 'ADMIN_', 'R2_', 'SOFTFILE_'],
  define: {
    __DEV_WEBCAM__: JSON.stringify(isDevWebcam),
  },
  plugins: [tailwindcss(), sveltekit(), svelteEmptyStyleFallbackPlugin()],
  resolve: {
    alias: {
      '@potohub/booth-ui/fonts.css': path.resolve(__dirname, '../booth-ui/src/fonts.css'),
      '@potohub/booth-ui/schema': path.resolve(__dirname, '../booth-ui/src/schema/index.ts'),
      '@potohub/booth-ui/presets': path.resolve(__dirname, '../booth-ui/src/presets/index.ts'),
      '@potohub/booth-ui': path.resolve(__dirname, '../booth-ui/src/index.ts'),
    },
    dedupe: ['svelte', '@lucide/svelte'],
  },
  optimizeDeps: {
    exclude: ['@potohub/booth-ui'],
  },
  ssr: {
    noExternal: ['@potohub/booth-ui'],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    fs: {
      allow: ['..'],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
