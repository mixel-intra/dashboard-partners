import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests unitarios de la lógica pura (filtros/KPIs, plantillas, director, CDE,
// eventos, kommo) y de los route handlers con fetch/Supabase mockeados.
// Los archivos que tocan DOM/localStorage declaran `@vitest-environment happy-dom`
// en su docblock; el resto corre en node (más rápido).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'legacy', '.next'],
  },
});
