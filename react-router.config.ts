import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Habilita el despliegue SSR en Vercel (functions, bundle splitting, etc.).
  presets: [vercelPreset()],
} satisfies Config;
