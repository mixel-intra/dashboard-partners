'use client';

import { useEffect, useState } from 'react';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { render, sampleData, detectPlaceholders, isQualifiedStatus } from '@/lib/leadTemplate';
import { serializarPlantilla, type PlantillaCampos } from './tipos';

// Editor de plantilla HTML del lead + directorio de leads calificados —
// port de legacy/src/lead-template-editor.js (LeadTemplateEditor + LeadDirectory)
// y de las secciones #sec-lead-template / #sec-lead-directory de admin.html.
// El render/placeholders reusa lib/leadTemplate.ts (port de lead-template-render.js).

interface LeadRow {
  lead_id: string;
  sucursal: string | null;
  estatus: string | null;
  payload: any;
  updated_at: string;
}

const HINT_DETECT_DEFAULT =
  'Click en "Detectar" para listar los campos disponibles del webhook actual (luego click en un chip para copiarlo).';

export default function EditorPlantillaLead({
  campos,
  onChange,
  cfg,
}: {
  campos: PlantillaCampos;
  onChange: (patch: Partial<PlantillaCampos>) => void;
  // Config actual del entorno seleccionado (webhook_url, id_slug) — equivale a
  // window.adminBackofficeState.currentConfig del legacy ({} para cliente nuevo).
  cfg: any;
}) {
  /* ========================== EDITOR ========================== */
  const [previewHtml, setPreviewHtml] = useState(() => render(campos.tplHtml, sampleData()));

  // Debounce 220ms del preview (igual que renderPreviewDebounced del legacy).
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(render(campos.tplHtml, sampleData())), 220);
    return () => clearTimeout(t);
  }, [campos.tplHtml, campos.tplLeadIdField, campos.tplSucursalField, campos.tplEstatusField, campos.tplQualifiedStages]);

  const placeholders = detectPlaceholders(campos.tplHtml);

  function subirArchivo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const html = String(e.target?.result ?? '');
      onChange({ tplHtml: html });
      setPreviewHtml(render(html, sampleData())); // el legacy renderiza inmediato
    };
    reader.onerror = () => alert('Error leyendo el archivo.');
    reader.readAsText(file);
  }

  function vaciarEditor() {
    if (!confirm('¿Vaciar el editor de HTML?')) return;
    onChange({ tplHtml: '' });
    setPreviewHtml(render('', sampleData()));
  }

  function refrescarPreview() {
    setPreviewHtml(render(campos.tplHtml, sampleData()));
  }

  function abrirPreview() {
    const html = render(campos.tplHtml, sampleData());
    const w = window.open();
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  }

  /* ---- Detector de campos del webhook ---- */
  const [hintCampos, setHintCampos] = useState(HINT_DETECT_DEFAULT);
  const [chipsCampos, setChipsCampos] = useState<string[]>([]);
  const [chipFlash, setChipFlash] = useState<string | null>(null);

  async function detectarCampos() {
    const url = cfg?.webhook_url;
    if (!url) {
      setHintCampos('No hay webhook configurado en este entorno.');
      setChipsCampos([]);
      return;
    }
    setHintCampos('Consultando webhook…');
    setChipsCampos([]);
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.json();
      const list = Array.isArray(raw) ? raw : raw.records || raw.data || [];
      if (!list.length) {
        setHintCampos('El webhook respondió sin registros.');
        return;
      }
      const keys = new Set<string>();
      list.slice(0, 5).forEach((item: any) => Object.keys(item || {}).forEach((k) => keys.add(k)));
      const sorted = [...keys].sort();
      setHintCampos(`${sorted.length} campos detectados — click para copiar al portapapeles:`);
      setChipsCampos(sorted);
    } catch (e: any) {
      setHintCampos(`Error: ${e.message}`);
    }
  }

  function copiarChip(key: string) {
    const ph = `{{${key}}}`;
    navigator.clipboard.writeText(ph).then(() => {
      setChipFlash(key);
      setTimeout(() => setChipFlash(null), 600);
    });
  }

  /* ========================== DIRECTORY ========================== */
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [stats, setStats] = useState('Aún no se han cargado leads.');
  const [sincronizando, setSincronizando] = useState(false);
  const [leadCopiado, setLeadCopiado] = useState<string | null>(null);

  function filtrar(lista: LeadRow[], q: string, suc: string): LeadRow[] {
    return lista.filter((l) => {
      if (suc && String(l.sucursal || '') !== suc) return false;
      if (q) {
        const blob = (
          l.lead_id + ' ' + (l.sucursal || '') + ' ' + (l.estatus || '') + ' ' + JSON.stringify(l.payload || {})
        ).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }

  function msgConteo(lista: LeadRow[], q: string, suc: string): string {
    const filtered = filtrar(lista, q, suc);
    return `${filtered.length} lead${filtered.length === 1 ? '' : 's'} · ${lista.length} almacenados`;
  }

  // Refresh: lee de qualified_leads (no del webhook)
  async function recargar() {
    if (!cfg || !cfg.id_slug) {
      setStats('Selecciona un entorno primero.');
      return;
    }
    setStats('Cargando leads almacenados…');
    const { data, error } = await getAdminSupabase()
      .from('qualified_leads')
      .select('lead_id, sucursal, estatus, payload, updated_at')
      .eq('client_id', cfg.id_slug)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) {
      setStats(`Error: ${error.message}`);
      return;
    }
    const nuevos = (data as LeadRow[]) || [];
    setLeads(nuevos);
    // Igual que populateSucursalFilter: conserva la selección si sigue existiendo
    const set = new Set(nuevos.filter((l) => l.sucursal).map((l) => l.sucursal as string));
    const sucActual = sucursal && set.has(sucursal) ? sucursal : '';
    if (sucActual !== sucursal) setSucursal(sucActual);
    setStats(msgConteo(nuevos, busqueda.trim().toLowerCase(), sucActual));
  }

  // Sincroniza: webhook → filtra qualified_stages → upsert en qualified_leads
  async function sincronizar() {
    if (!cfg || !cfg.id_slug) {
      alert('Selecciona un entorno primero.');
      return;
    }
    if (!cfg.webhook_url) {
      alert('Este entorno no tiene webhook configurado.');
      return;
    }

    const tpl = serializarPlantilla(campos);
    if (!tpl.qualified_stages.length) {
      alert('Define al menos un valor en "Etapas calificadas" antes de sincronizar.');
      return;
    }

    setSincronizando(true);
    setStats('Consultando webhook…');

    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(cfg.webhook_url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`Webhook HTTP ${resp.status}`);
      const raw = await resp.json();
      const list: any[] = Array.isArray(raw) ? raw : raw.records || raw.data || [];

      const idField = tpl.lead_id_field;
      const sucField = tpl.sucursal_field;
      const estField = tpl.estatus_field;
      const qualified = list.filter((l) => isQualifiedStatus(l && l[estField], tpl.qualified_stages));

      if (qualified.length === 0) {
        // El legacy pone este mensaje y de inmediato lo sobreescribe el
        // re-render de la tabla con el conteo — dejamos el conteo (mismo neto).
        setStats(msgConteo(leads || [], busqueda.trim().toLowerCase(), sucursal));
        setSincronizando(false);
        return;
      }

      // Build rows for upsert
      const rows = qualified
        .filter((l) => l && l[idField] != null)
        .map((l) => ({
          lead_id: String(l[idField]),
          client_id: cfg.id_slug,
          payload: l,
          sucursal: l[sucField] != null ? String(l[sucField]) : null,
          estatus: l[estField] != null ? String(l[estField]) : null,
          updated_at: new Date().toISOString(),
        }));

      setStats(`Subiendo ${rows.length} leads a Supabase…`);

      // Upsert en chunks para no hacer un solo request gigante
      const CHUNK = 100;
      let ok = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error } = await getAdminSupabase()
          .from('qualified_leads')
          .upsert(slice, { onConflict: 'lead_id' });
        if (error) throw new Error(error.message);
        ok += slice.length;
        setStats(`Subiendo… ${ok}/${rows.length}`);
      }

      setStats(`✓ ${rows.length} leads calificados sincronizados.`);
      await recargar();
    } catch (e: any) {
      setStats(`Error: ${e.message}`);
      console.error('syncDirectory:', e);
    } finally {
      setSincronizando(false);
    }
  }

  function copiarUrlLead(leadId: string, url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setLeadCopiado(leadId);
      setTimeout(() => setLeadCopiado(null), 1200);
    });
  }

  const q = busqueda.trim().toLowerCase();
  const filtrados = leads ? filtrar(leads, q, sucursal) : [];
  const sucursales = leads
    ? [...new Set(leads.filter((l) => l.sucursal).map((l) => l.sucursal as string))].sort()
    : [];

  return (
    <>
      {/* ── SECCIÓN 6: Plantilla HTML del Lead ── */}
      <div className="sc sc-accent-amber" id="sec-lead-template">
        <div className="sc-head">
          <div className="sc-icon sci-amber">
            <ion-icon name="code-slash-outline"></ion-icon>
          </div>
          <div className="sc-labels">
            <span className="sc-eyebrow">Compartible</span>
            <span className="sc-title">Plantilla HTML del Lead</span>
          </div>
        </div>
        <div className="sc-body">
          <p className="hint" style={{ marginBottom: 16 }}>
            Pega o sube tu HTML completo. Donde quieras inyectar un valor del lead, usa{' '}
            <code className="tpl-tag">{'{{campo}}'}</code>. Para fallback:{' '}
            <code className="tpl-tag">{'{{campo|—}}'}</code>. Para HTML sin escapar (links):{' '}
            <code className="tpl-tag">{'{{campo|raw}}'}</code>. El link público que mandas por WhatsApp es{' '}
            <code className="tpl-tag">{'/lead?id=<lead_id>'}</code>.
          </p>

          <div className="tpl-grid">
            {/* ===== LEFT: HTML editor ===== */}
            <div className="tpl-editor">
              {/* HTML body */}
              <div className="tpl-block">
                <div className="tpl-block-head">
                  <ion-icon name="code-slash-outline"></ion-icon>
                  <span>HTML del template</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <label className="tpl-icon-btn" title="Subir archivo .html">
                      <ion-icon name="cloud-upload-outline"></ion-icon> Subir
                      <input
                        type="file"
                        id="tpl-file"
                        accept=".html,.htm,text/html"
                        hidden
                        onChange={(e) => subirArchivo(e.target.files?.[0])}
                      />
                    </label>
                    <button type="button" id="tpl-clear-btn" className="tpl-icon-btn danger" title="Vaciar" onClick={vaciarEditor}>
                      <ion-icon name="trash-outline"></ion-icon>
                    </button>
                  </div>
                </div>
                <textarea
                  id="tpl-html"
                  className="tpl-html-textarea"
                  spellCheck={false}
                  placeholder={'<!DOCTYPE html>\n<html>\n  <body>\n    <h1>{{nombre}}</h1>\n    <p>Sucursal: {{sucursal_sugerida}}</p>\n  </body>\n</html>'}
                  value={campos.tplHtml}
                  onChange={(e) => onChange({ tplHtml: e.target.value })}
                ></textarea>
              </div>

              {/* Placeholders detected */}
              <div className="tpl-block">
                <div className="tpl-block-head">
                  <ion-icon name="bookmarks-outline"></ion-icon>
                  <span>Placeholders usados en tu HTML</span>
                </div>
                <div id="tpl-placeholders-chips" className="tpl-chips">
                  {placeholders.length === 0 ? (
                    <span className="tpl-hint-inline">
                      Pega tu HTML y los <code>{'{{placeholders}}'}</code> aparecerán aquí.
                    </span>
                  ) : (
                    placeholders.map((p) => (
                      <span key={p} className="tpl-chip tpl-chip-static">
                        {'{{' + p + '}}'}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Identifiers + qualified stages */}
              <div className="tpl-block">
                <div className="tpl-block-head">
                  <ion-icon name="finger-print-outline"></ion-icon>
                  <span>Mapeo del webhook</span>
                </div>
                <div className="fg">
                  <div className="fg-group">
                    <label className="fgl" htmlFor="tpl-lead-id-field">
                      Campo del ID único
                    </label>
                    <input
                      type="text"
                      id="tpl-lead-id-field"
                      className="fi"
                      placeholder="id"
                      value={campos.tplLeadIdField}
                      onChange={(e) => onChange({ tplLeadIdField: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl" htmlFor="tpl-sucursal-field">
                      Campo de sucursal
                    </label>
                    <input
                      type="text"
                      id="tpl-sucursal-field"
                      className="fi"
                      placeholder="sucursal_sugerida"
                      value={campos.tplSucursalField}
                      onChange={(e) => onChange({ tplSucursalField: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl" htmlFor="tpl-estatus-field">
                      Campo de estatus / etapa
                    </label>
                    <input
                      type="text"
                      id="tpl-estatus-field"
                      className="fi"
                      placeholder="estatus"
                      value={campos.tplEstatusField}
                      onChange={(e) => onChange({ tplEstatusField: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl" htmlFor="tpl-qualified-stages">
                      Etapas calificadas (separadas por coma)
                    </label>
                    <input
                      type="text"
                      id="tpl-qualified-stages"
                      className="fi"
                      placeholder="empeño oro, empeño otros, rescate de prenda, cita agendada, reagendar, empeñado"
                      value={campos.tplQualifiedStages}
                      onChange={(e) => onChange({ tplQualifiedStages: e.target.value })}
                    />
                  </div>
                </div>
                <p className="hint" style={{ marginTop: 9 }}>
                  Solo los leads cuyo <em>estatus</em> contenga alguno de estos valores (case-insensitive) se
                  sincronizan a la base.
                </p>
              </div>

              {/* Webhook field detector */}
              <div className="tpl-block">
                <div className="tpl-block-head">
                  <ion-icon name="cloud-download-outline"></ion-icon>
                  <span>Campos del webhook</span>
                  <button
                    type="button"
                    id="tpl-detect-fields"
                    className="tpl-icon-btn"
                    title="Consultar webhook y detectar campos"
                    style={{ marginLeft: 'auto' }}
                    onClick={detectarCampos}
                  >
                    <ion-icon name="refresh-outline"></ion-icon> Detectar
                  </button>
                </div>
                <p className="hint" id="tpl-fields-hint">
                  {hintCampos}
                </p>
                <div id="tpl-fields-chips" className="tpl-chips">
                  {chipsCampos.map((k) => (
                    <span
                      key={k}
                      className={`tpl-chip ${chipFlash === k ? 'tpl-chip-flash' : ''}`}
                      onClick={() => copiarChip(k)}
                    >
                      {'{{' + k + '}}'}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ===== RIGHT: live preview ===== */}
            <div className="tpl-preview-col">
              <div className="tpl-preview-head">
                <ion-icon name="eye-outline"></ion-icon>
                <span>Vista previa con datos de ejemplo</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                  <button type="button" id="tpl-preview-refresh" className="tpl-icon-btn" title="Refrescar preview" onClick={refrescarPreview}>
                    <ion-icon name="refresh-outline"></ion-icon>
                  </button>
                  <button type="button" id="tpl-preview-open" className="tpl-icon-btn" title="Abrir en pestaña" onClick={abrirPreview}>
                    <ion-icon name="open-outline"></ion-icon>
                  </button>
                </div>
              </div>
              <iframe id="tpl-preview-iframe" className="tpl-preview-iframe" sandbox="allow-same-origin" srcDoc={previewHtml}></iframe>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 7: Directorio de Leads Calificados ── */}
      <div className="sc sc-accent-green" id="sec-lead-directory">
        <div className="sc-head">
          <div className="sc-icon sci-green">
            <ion-icon name="link-outline"></ion-icon>
          </div>
          <div className="sc-labels">
            <span className="sc-eyebrow">WhatsApp Automation</span>
            <span className="sc-title">Leads Calificados Almacenados</span>
          </div>
        </div>
        <div className="sc-body">
          <p className="hint" style={{ marginBottom: 14 }}>
            Lista persistida de leads calificados (tabla <code className="tpl-tag">qualified_leads</code>). Cada uno
            tiene su URL única <code className="tpl-tag">{'/lead?id=<lead_id>'}</code> lista para enviar por WhatsApp.
            Sincroniza desde el webhook para que la URL siga funcionando aunque el webhook esté offline.
          </p>
          <div className="dir-controls">
            <button type="button" id="dir-sync" className="btn btn-primary" disabled={sincronizando} onClick={sincronizar}>
              {sincronizando ? (
                <>
                  <ion-icon name="hourglass-outline"></ion-icon> Sincronizando…
                </>
              ) : (
                <>
                  <ion-icon name="cloud-download-outline"></ion-icon> Sincronizar desde webhook
                </>
              )}
            </button>
            <button type="button" id="dir-refresh" className="btn btn-ghost" onClick={recargar}>
              <ion-icon name="refresh-outline"></ion-icon> Recargar
            </button>
            <input
              type="text"
              id="dir-search"
              className="fi"
              placeholder="Buscar por nombre, teléfono, ID…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                if (leads) setStats(msgConteo(leads, e.target.value.trim().toLowerCase(), sucursal));
              }}
            />
            <select
              id="dir-sucursal"
              className="fi"
              value={sucursal}
              onChange={(e) => {
                setSucursal(e.target.value);
                if (leads) setStats(msgConteo(leads, q, e.target.value));
              }}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div id="dir-stats" className="dir-stats">
            {stats}
          </div>
          <div id="dir-table" className="dir-table">
            {leads !== null &&
              (filtrados.length === 0 ? (
                <div className="dir-empty">
                  {leads.length === 0
                    ? 'Sin leads almacenados. Click en "Sincronizar leads calificados" arriba.'
                    : 'No hay leads para los filtros actuales.'}
                </div>
              ) : (
                <>
                  <div className="dir-row dir-header">
                    <div className="dir-cell">Lead</div>
                    <div className="dir-cell">Sucursal</div>
                    <div className="dir-cell">Estatus</div>
                    <div className="dir-cell">Acciones</div>
                  </div>
                  {filtrados.map((l) => {
                    const payload = l.payload || {};
                    const name =
                      payload.nombre || payload.name || payload.cliente || payload.cliente_nombre || `Lead ${l.lead_id}`;
                    const url = `${window.location.origin}/lead?id=${encodeURIComponent(l.lead_id)}`;
                    return (
                      <div className="dir-row" key={l.lead_id}>
                        <div className="dir-cell">
                          <strong>{name}</strong>
                          <span className="dir-id-line">#{l.lead_id}</span>
                        </div>
                        <div className="dir-cell">{l.sucursal || '—'}</div>
                        <div className="dir-cell">{l.estatus || '—'}</div>
                        <div className="dir-actions">
                          <button type="button" title="Copiar URL" onClick={() => copiarUrlLead(l.lead_id, url)}>
                            {leadCopiado === l.lead_id ? (
                              <ion-icon name="checkmark-outline" style={{ color: 'var(--green)' }}></ion-icon>
                            ) : (
                              <ion-icon name="copy-outline"></ion-icon>
                            )}
                          </button>
                          <a href={url} target="_blank" rel="noopener" title="Abrir">
                            <ion-icon name="open-outline"></ion-icon>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
