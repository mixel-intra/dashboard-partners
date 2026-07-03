/* ============================================================
   Lead Template Editor + Directory
   - Editor: textarea de HTML libre + file upload + preview en iframe.
   - Directory: lista qualified_leads desde Supabase + botón "Sincronizar"
     que filtra el webhook por qualified_stages y upserta.

   API pública:
     window.LeadTemplateEditor.init()
     window.LeadTemplateEditor.load(template)
     window.LeadTemplateEditor.serialize()
     window.LeadTemplateEditor.reset()
     window.LeadDirectory.init()
     window.LeadDirectory.refresh()
     window.LeadDirectory.sync()
============================================================ */
(function (root) {
    'use strict';

    const $ = id => document.getElementById(id);

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function debounce(fn, ms) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    /* ==========================================================
       EDITOR
    ========================================================== */
    function loadEditor(template) {
        const tpl = template && Object.keys(template).length ? template : root.LeadTemplate.emptyTemplate();
        if ($('tpl-html'))           $('tpl-html').value           = tpl.html              || '';
        if ($('tpl-lead-id-field'))  $('tpl-lead-id-field').value  = tpl.lead_id_field     || 'id';
        if ($('tpl-sucursal-field')) $('tpl-sucursal-field').value = tpl.sucursal_field    || 'sucursal';
        if ($('tpl-estatus-field'))  $('tpl-estatus-field').value  = tpl.estatus_field     || 'estatus';
        if ($('tpl-qualified-stages')) {
            const list = Array.isArray(tpl.qualified_stages) ? tpl.qualified_stages : [];
            $('tpl-qualified-stages').value = list.join(', ');
        }
        renderPreview();
        updateDetectedFieldsFromHtml();
    }

    function resetEditor() { loadEditor(root.LeadTemplate.emptyTemplate()); }

    function serializeEditor() {
        const raw = $('tpl-qualified-stages')?.value || '';
        const stages = raw.split(',').map(s => s.trim()).filter(Boolean);
        return {
            html:             $('tpl-html')?.value           || '',
            lead_id_field:    $('tpl-lead-id-field')?.value.trim() || 'id',
            sucursal_field:   $('tpl-sucursal-field')?.value.trim() || 'sucursal',
            estatus_field:    $('tpl-estatus-field')?.value.trim() || 'estatus',
            qualified_stages: stages
        };
    }

    function renderPreview() {
        const iframe = $('tpl-preview-iframe');
        if (!iframe || !root.LeadTemplate) return;
        const tpl = serializeEditor();
        const html = root.LeadTemplate.render(tpl.html, root.LeadTemplate.sampleData());
        iframe.srcdoc = html;
    }
    const renderPreviewDebounced = debounce(renderPreview, 220);

    function updateDetectedFieldsFromHtml() {
        const box = $('tpl-placeholders-chips');
        if (!box) return;
        const html = $('tpl-html')?.value || '';
        const placeholders = root.LeadTemplate.detectPlaceholders(html);
        if (placeholders.length === 0) {
            box.innerHTML = '<span class="tpl-hint-inline">Pega tu HTML y los <code>{{placeholders}}</code> aparecerán aquí.</span>';
            return;
        }
        box.innerHTML = placeholders.map(p =>
            `<span class="tpl-chip tpl-chip-static">${escapeHtml('{{' + p + '}}')}</span>`
        ).join('');
    }

    function handleFileUpload(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            $('tpl-html').value = e.target.result;
            renderPreview();
            updateDetectedFieldsFromHtml();
        };
        reader.onerror = () => alert('Error leyendo el archivo.');
        reader.readAsText(file);
    }

    async function detectWebhookFields() {
        const hint  = $('tpl-fields-hint');
        const chips = $('tpl-fields-chips');
        if (!hint || !chips) return;

        const url = root.adminBackofficeState?.currentConfig?.webhook_url;
        if (!url) {
            hint.textContent = 'No hay webhook configurado en este entorno.';
            chips.innerHTML = '';
            return;
        }
        hint.textContent = 'Consultando webhook…';
        chips.innerHTML = '';
        try {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const raw  = await resp.json();
            const list = Array.isArray(raw) ? raw : (raw.records || raw.data || []);
            if (!list.length) {
                hint.textContent = 'El webhook respondió sin registros.';
                return;
            }
            const keys = new Set();
            list.slice(0, 5).forEach(item => Object.keys(item || {}).forEach(k => keys.add(k)));
            const sorted = [...keys].sort();
            hint.textContent = `${sorted.length} campos detectados — click para copiar al portapapeles:`;
            chips.innerHTML = sorted.map(k => {
                const ph = `{{${k}}}`;
                return `<span class="tpl-chip" data-placeholder="${escapeAttr(ph)}">${escapeHtml(ph)}</span>`;
            }).join('');
        } catch (e) {
            hint.textContent = `Error: ${e.message}`;
        }
    }

    function initEditor() {
        $('tpl-html')?.addEventListener('input', () => {
            renderPreviewDebounced();
            updateDetectedFieldsFromHtml();
        });
        ['tpl-lead-id-field','tpl-sucursal-field','tpl-estatus-field','tpl-qualified-stages'].forEach(id => {
            $(id)?.addEventListener('input', renderPreviewDebounced);
        });

        const fileInput = $('tpl-file');
        if (fileInput) {
            fileInput.addEventListener('change', () => handleFileUpload(fileInput.files[0]));
        }

        $('tpl-clear-btn')?.addEventListener('click', () => {
            if (!confirm('¿Vaciar el editor de HTML?')) return;
            $('tpl-html').value = '';
            renderPreview();
            updateDetectedFieldsFromHtml();
        });

        $('tpl-detect-fields')?.addEventListener('click', detectWebhookFields);

        $('tpl-fields-chips')?.addEventListener('click', ev => {
            const chip = ev.target.closest('.tpl-chip[data-placeholder]');
            if (!chip) return;
            const ph = chip.getAttribute('data-placeholder');
            navigator.clipboard.writeText(ph).then(() => {
                chip.classList.add('tpl-chip-flash');
                setTimeout(() => chip.classList.remove('tpl-chip-flash'), 600);
            });
        });

        $('tpl-preview-refresh')?.addEventListener('click', renderPreview);
        $('tpl-preview-open')?.addEventListener('click', () => {
            const tpl = serializeEditor();
            const html = root.LeadTemplate.render(tpl.html, root.LeadTemplate.sampleData());
            const w = window.open();
            if (w) { w.document.open(); w.document.write(html); w.document.close(); }
        });
    }

    /* ==========================================================
       DIRECTORY  (lee de qualified_leads, sincroniza desde webhook)
    ========================================================== */
    let dirState = { leads: [], clientId: null };

    function initDirectory() {
        $('dir-sync')?.addEventListener('click', syncDirectory);
        $('dir-refresh')?.addEventListener('click', refreshDirectory);
        $('dir-search')?.addEventListener('input', renderDirectoryTable);
        $('dir-sucursal')?.addEventListener('change', renderDirectoryTable);
    }

    function statusEl() { return $('dir-stats'); }
    function setStatus(msg) { const el = statusEl(); if (el) el.textContent = msg; }

    // Sincroniza: webhook → filtra qualified_stages → upsert en qualified_leads
    async function syncDirectory() {
        const cfg = root.adminBackofficeState?.currentConfig;
        if (!cfg || !cfg.id_slug) { alert('Selecciona un entorno primero.'); return; }
        if (!cfg.webhook_url)     { alert('Este entorno no tiene webhook configurado.'); return; }

        const tpl = serializeEditor();
        if (!tpl.qualified_stages.length) {
            alert('Define al menos un valor en "Etapas calificadas" antes de sincronizar.');
            return;
        }

        const btn = $('dir-sync');
        const original = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Sincronizando…'; }
        setStatus('Consultando webhook…');

        try {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(cfg.webhook_url)}`;
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error(`Webhook HTTP ${resp.status}`);
            const raw  = await resp.json();
            const list = Array.isArray(raw) ? raw : (raw.records || raw.data || []);

            const idField   = tpl.lead_id_field;
            const sucField  = tpl.sucursal_field;
            const estField  = tpl.estatus_field;
            const qualified = list.filter(l => root.LeadTemplate.isQualifiedStatus(l && l[estField], tpl.qualified_stages));

            if (qualified.length === 0) {
                setStatus(`Sin leads calificados en el webhook (${list.length} totales).`);
                if (btn) { btn.disabled = false; btn.innerHTML = original; }
                renderDirectoryTable();
                return;
            }

            // Build rows for upsert
            const rows = qualified
                .filter(l => l && l[idField] != null)
                .map(l => ({
                    lead_id:   String(l[idField]),
                    client_id: cfg.id_slug,
                    payload:   l,
                    sucursal:  l[sucField]  != null ? String(l[sucField])  : null,
                    estatus:   l[estField]  != null ? String(l[estField])  : null,
                    updated_at: new Date().toISOString()
                }));

            setStatus(`Subiendo ${rows.length} leads a Supabase…`);

            // Upsert en chunks para no hacer un solo request gigante
            const CHUNK = 100;
            let ok = 0;
            for (let i = 0; i < rows.length; i += CHUNK) {
                const slice = rows.slice(i, i + CHUNK);
                const { error } = await root.adminSupabase
                    .from('qualified_leads')
                    .upsert(slice, { onConflict: 'lead_id' });
                if (error) throw new Error(error.message);
                ok += slice.length;
                setStatus(`Subiendo… ${ok}/${rows.length}`);
            }

            setStatus(`✓ ${rows.length} leads calificados sincronizados.`);
            await refreshDirectory();
        } catch (e) {
            setStatus(`Error: ${e.message}`);
            console.error('syncDirectory:', e);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = original; }
        }
    }

    // Refresh: lee de qualified_leads (no del webhook)
    async function refreshDirectory() {
        const cfg = root.adminBackofficeState?.currentConfig;
        if (!cfg || !cfg.id_slug) { setStatus('Selecciona un entorno primero.'); return; }
        dirState.clientId = cfg.id_slug;
        setStatus('Cargando leads almacenados…');
        const { data, error } = await root.adminSupabase
            .from('qualified_leads')
            .select('lead_id, sucursal, estatus, payload, updated_at')
            .eq('client_id', cfg.id_slug)
            .order('updated_at', { ascending: false })
            .limit(500);

        if (error) { setStatus(`Error: ${error.message}`); return; }
        dirState.leads = data || [];
        populateSucursalFilter();
        renderDirectoryTable();
    }

    function populateSucursalFilter() {
        const set = new Set();
        dirState.leads.forEach(l => { if (l.sucursal) set.add(l.sucursal); });
        const sel = $('dir-sucursal');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = `<option value="">Todas las sucursales</option>` +
            [...set].sort().map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
        if (prev && [...set].includes(prev)) sel.value = prev;
    }

    function filterLeads() {
        const q   = ($('dir-search')?.value   || '').trim().toLowerCase();
        const suc = ($('dir-sucursal')?.value || '').trim();
        return dirState.leads.filter(l => {
            if (suc && String(l.sucursal || '') !== suc) return false;
            if (q) {
                const blob = (l.lead_id + ' ' + (l.sucursal || '') + ' ' + (l.estatus || '') + ' ' +
                              JSON.stringify(l.payload || {})).toLowerCase();
                if (!blob.includes(q)) return false;
            }
            return true;
        });
    }

    function renderDirectoryTable() {
        const filtered = filterLeads();
        setStatus(`${filtered.length} lead${filtered.length === 1 ? '' : 's'} · ${dirState.leads.length} almacenados`);

        const table = $('dir-table');
        if (!table) return;
        if (filtered.length === 0) {
            table.innerHTML = `<div class="dir-empty">
                ${dirState.leads.length === 0
                    ? 'Sin leads almacenados. Click en "Sincronizar leads calificados" arriba.'
                    : 'No hay leads para los filtros actuales.'}
            </div>`;
            return;
        }

        const header = `
            <div class="dir-row dir-header">
                <div class="dir-cell">Lead</div>
                <div class="dir-cell">Sucursal</div>
                <div class="dir-cell">Estatus</div>
                <div class="dir-cell">Acciones</div>
            </div>
        `;
        const rows = filtered.map(l => {
            const payload = l.payload || {};
            const name = payload.nombre || payload.name || payload.cliente || payload.cliente_nombre || `Lead ${l.lead_id}`;
            const url  = `${window.location.origin}/lead.html?id=${encodeURIComponent(l.lead_id)}`;
            return `
                <div class="dir-row">
                    <div class="dir-cell">
                        <strong>${escapeHtml(name)}</strong>
                        <span class="dir-id-line">#${escapeHtml(l.lead_id)}</span>
                    </div>
                    <div class="dir-cell">${escapeHtml(l.sucursal || '—')}</div>
                    <div class="dir-cell">${escapeHtml(l.estatus || '—')}</div>
                    <div class="dir-actions">
                        <button type="button" data-copy="${escapeAttr(url)}" title="Copiar URL">
                            <ion-icon name="copy-outline"></ion-icon>
                        </button>
                        <a href="${escapeAttr(url)}" target="_blank" rel="noopener" title="Abrir">
                            <ion-icon name="open-outline"></ion-icon>
                        </a>
                    </div>
                </div>
            `;
        }).join('');

        table.innerHTML = header + rows;

        table.querySelectorAll('button[data-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const u = btn.getAttribute('data-copy');
                navigator.clipboard.writeText(u).then(() => {
                    btn.innerHTML = '<ion-icon name="checkmark-outline" style="color:var(--green);"></ion-icon>';
                    setTimeout(() => { btn.innerHTML = '<ion-icon name="copy-outline"></ion-icon>'; }, 1200);
                });
            });
        });
    }

    /* Public API */
    root.LeadTemplateEditor = {
        init: initEditor,
        load: loadEditor,
        serialize: serializeEditor,
        reset: resetEditor
    };
    root.LeadDirectory = {
        init: initDirectory,
        refresh: refreshDirectory,
        sync: syncDirectory
    };
})(window);
