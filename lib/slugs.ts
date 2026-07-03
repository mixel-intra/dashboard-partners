// Casos especiales por slug — centralizados aquí para que los guards
// `if (slug === …)` portados del legacy tengan un solo punto de verdad.
// NO es un sistema de feature-flags: la lógica sigue siendo por slug (paridad).

export const SLUGS = {
  CEFEMEX: 'cefemex',
  /** Ambas grafías coexisten en datos reales (con y sin acento). */
  CASA_EMPENO: ['casa-de-empeño', 'casa-de-empeno'] as const,
  ROOF_107: 'roof-107',
  INTRA: 'intra',
  LOGIC_SYSTEMS: 'logic-systems',
} as const;

export function esCasaDeEmpeno(slug: string | null | undefined): boolean {
  return !!slug && (SLUGS.CASA_EMPENO as readonly string[]).includes(slug);
}

/** Solo roof-107 tiene la feature de archivo de reservas. */
export function tieneArchivoReservas(slug: string | null | undefined): boolean {
  return slug === SLUGS.ROOF_107;
}

// --- CEFEMEX: calificación por etapa de pipeline de Kommo (no por texto) ---
// Port literal de legacy/src/dashboard.js:1654-1670.
export const CEFEMEX_ETAPAS_CALIFICADAS = new Set<number>([
  // #8 Rechazado (100538408) NO cuenta — un lead rechazado no es una oportunidad calificada
  100538404, // #9  Condicionado
  100458628, // #10 Lead Calificado
  100538416, // #11 Atención personalizada
  101647764, // #12 Contacto inicial
  94994543, // #13 Integración de expediente E1
  104432180, // #14 Preanálisis
  94994547, // #15 Integración de expediente E2 / Investigación
  104432184, // #16 Análisis
  94994551, // #17 Comité / Autorización
  104432704, // #18 Formalización
  // #19 LEADS HILLFLARE (94994555) se ignora por completo — filtrado en el workflow "DASHBOARD" de n8n
]);
export const CEFEMEX_ETAPA_GANADO = 142;
export const CEFEMEX_ETAPA_PERDIDO = 143;
export const CEFEMEX_TAGS_CALIFICAN = ['calificado_intra', 'condicionado_intra'];
