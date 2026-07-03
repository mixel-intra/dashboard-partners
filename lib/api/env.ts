// Validación de env server-side. A diferencia del legacy, NO hay fallbacks
// hardcodeados: si falta una variable, el endpoint falla ruidoso con un
// mensaje claro (mismo texto que usaba el legacy para AIRTABLE_TOKEN).

export class EnvFaltanteError extends Error {
  constructor(name: string) {
    super(`Falta ${name} en el entorno. Configúralo en Vercel → Settings → Environment Variables.`);
    this.name = 'EnvFaltanteError';
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new EnvFaltanteError(name);
  return v;
}

/** Primer env definido de la lista (para cadenas tipo ADMIN_SUPABASE_URL || SUPABASE_URL). */
export function requireAnyEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new EnvFaltanteError(names.join(' / '));
}
