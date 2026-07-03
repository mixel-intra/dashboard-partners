/* ============================================================
   Lead Template Render — sustitución de placeholders en HTML libre.
   Port 1:1 de legacy/src/lead-template-render.js (puro, sin DOM).
   Compartido por /lead (server) y el editor de plantillas de /admin.
============================================================ */

export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getField(obj: any, path: string): any {
  if (!obj || !path) return null;
  return path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj);
}

// Sustituye {{campo}} y {{campo.anidado}} por valores del lead.
// Variantes:
//   {{campo}}              → escapado (HTML-safe). Si vacío, "".
//   {{campo|fallback}}     → si vacío, usa el fallback literal (escapado).
//   {{campo|raw}}          → SIN escapar (úsalo solo con HTML que TÚ controlas).
export function substitute(html: unknown, data: any): string {
  if (html == null) return '';
  return String(html).replace(/\{\{\s*([\w.\-]+)(?:\s*\|\s*([^}]+?))?\s*\}\}/g, (_, key, mod) => {
    let val = getField(data, key);
    const raw = mod && mod.trim() === 'raw';
    const fallback = !raw && mod ? mod.trim() : '';
    if (val == null || val === '') val = fallback;
    if (val == null) return '';
    return raw ? String(val) : escapeHtml(val);
  });
}

export function isFullDocument(html: unknown): boolean {
  if (!html) return false;
  const head = String(html).slice(0, 200).toLowerCase();
  return head.includes('<!doctype') || head.includes('<html');
}

// Render aplica la sustitución y devuelve el HTML final.
// - `mode = 'document'` → asume HTML completo; devuelve tal cual.
// - `mode = 'fragment'` → envuelve en un body mínimo para preview en iframe.
export function render(html: unknown, data: any, mode?: 'document' | 'fragment'): string {
  const substituted = substitute(html || '', data || {});
  if (mode === 'document' || isFullDocument(substituted)) return substituted;
  // Fragment mode: wrap with minimal page chrome
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;}</style>
            </head><body>${substituted}</body></html>`;
}

// Detecta todos los placeholders {{...}} usados en el HTML (útil para validar y mostrar chips).
export function detectPlaceholders(html: unknown): string[] {
  if (!html) return [];
  const set = new Set<string>();
  String(html).replace(/\{\{\s*([\w.\-]+)/g, (m, key) => {
    set.add(key);
    return m;
  });
  return [...set].sort();
}

// Sample data genérico para preview (cuando el editor no tiene datos reales).
export function sampleData() {
  return {
    id: 'L-12345',
    lead_id: 'L-12345',
    nombre: '[Nombre del cliente]',
    telefono: '+52 999 000 0000',
    tipo_prenda: 'Anillo',
    quilataje: '14 K',
    estado: 'A',
    peso: '8',
    monto: '1,250',
    sucursal: 'Mérida Centro',
    sucursal_sugerida: 'Mérida Centro',
    direccion: 'Calle 50 #...',
    google_maps_url: '#',
    fecha: new Date().toLocaleString('es-MX'),
    estatus: 'Empeño Oro',
  };
}

// Lógica de "calificado": case-insensitive, contains match.
export function isQualifiedStatus(status: unknown, qualifiedStages: unknown[]): boolean {
  if (!qualifiedStages || qualifiedStages.length === 0) return false;
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  return qualifiedStages.some((stage) => {
    const t = String(stage).toLowerCase().trim();
    return !!t && s.includes(t);
  });
}

export function emptyTemplate() {
  return {
    html: '',
    lead_id_field: 'id',
    sucursal_field: 'sucursal',
    estatus_field: 'estatus',
    qualified_stages: [] as string[],
  };
}
