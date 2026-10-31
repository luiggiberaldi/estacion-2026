import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Suite de lógica pura de la Estación Maestra (sin Next, sin Supabase, sin DOM).
// El alias `@/` replica `tsconfig.json` para que los imports internos de `src/lib`
// resuelvan igual en los tests que en la app.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,js}'],
    reporters: ['default'],
  },
});
