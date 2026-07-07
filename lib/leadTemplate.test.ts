import { describe, it, expect } from 'vitest';
import {
  detectPlaceholders,
  emptyTemplate,
  escapeHtml,
  isFullDocument,
  isQualifiedStatus,
  render,
  substitute,
} from './leadTemplate';

describe('escapeHtml', () => {
  it('escapa las 5 entidades', () => {
    expect(escapeHtml(`<a href="x" title='y'>&`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;');
  });

  it('null/undefined → cadena vacía', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('substitute', () => {
  it('sustituye {{campo}} escapado por default', () => {
    expect(substitute('<p>{{nombre}}</p>', { nombre: '<b>Ana</b>' })).toBe(
      '<p>&lt;b&gt;Ana&lt;/b&gt;</p>'
    );
  });

  it('soporta campos anidados {{a.b}}', () => {
    expect(substitute('{{prenda.tipo}}', { prenda: { tipo: 'Anillo' } })).toBe('Anillo');
  });

  it('usa el fallback literal cuando el campo viene vacío', () => {
    expect(substitute('{{sucursal|Mérida Centro}}', {})).toBe('Mérida Centro');
    expect(substitute('{{sucursal|Mérida Centro}}', { sucursal: '' })).toBe('Mérida Centro');
    expect(substitute('{{sucursal|Mérida}}', { sucursal: 'Progreso' })).toBe('Progreso');
  });

  it('{{campo|raw}} NO escapa', () => {
    expect(substitute('{{html|raw}}', { html: '<b>x</b>' })).toBe('<b>x</b>');
  });

  it('campo inexistente sin fallback → cadena vacía', () => {
    expect(substitute('hola {{nada}}!', {})).toBe('hola !');
  });

  it('tolera espacios dentro de las llaves', () => {
    expect(substitute('{{ nombre }}', { nombre: 'Ana' })).toBe('Ana');
  });
});

describe('isFullDocument / render', () => {
  it('detecta documentos completos por doctype o <html>', () => {
    expect(isFullDocument('<!DOCTYPE html><html></html>')).toBe(true);
    expect(isFullDocument('<HTML lang="es">')).toBe(true);
    expect(isFullDocument('<div>fragmento</div>')).toBe(false);
  });

  it('render envuelve fragmentos con chrome mínimo', () => {
    const out = render('<h1>{{nombre}}</h1>', { nombre: 'Ana' });
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<h1>Ana</h1>');
  });

  it('render devuelve documentos completos tal cual (sin doble envoltura)', () => {
    const doc = '<!DOCTYPE html><html><body>{{nombre}}</body></html>';
    const out = render(doc, { nombre: 'Ana' });
    expect(out).toBe('<!DOCTYPE html><html><body>Ana</body></html>');
  });
});

describe('detectPlaceholders', () => {
  it('devuelve placeholders únicos y ordenados', () => {
    expect(detectPlaceholders('{{b}} {{a}} {{b|x}} {{a.c}}')).toEqual(['a', 'a.c', 'b']);
  });

  it('sin placeholders → []', () => {
    expect(detectPlaceholders('<p>estático</p>')).toEqual([]);
    expect(detectPlaceholders(null)).toEqual([]);
  });
});

describe('isQualifiedStatus', () => {
  it('match por contains, case-insensitive', () => {
    expect(isQualifiedStatus('EMPEÑO ORO calificado', ['empeño oro'])).toBe(true);
    expect(isQualifiedStatus('nuevo', ['empeño oro'])).toBe(false);
  });

  it('sin etapas configuradas o sin estatus → false', () => {
    expect(isQualifiedStatus('calificado', [])).toBe(false);
    expect(isQualifiedStatus(null, ['calificado'])).toBe(false);
  });
});

describe('emptyTemplate', () => {
  it('shape estable (lo espera el editor de admin)', () => {
    expect(emptyTemplate()).toEqual({
      html: '',
      lead_id_field: 'id',
      sucursal_field: 'sucursal',
      estatus_field: 'estatus',
      qualified_stages: [],
    });
  });
});
