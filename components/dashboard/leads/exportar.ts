'use client';

// Exportaciones del dashboard — port de exportToPDF() y exportLeadsToExcel()
// de legacy/src/dashboard.js. Las librerías pesadas (jspdf/html2canvas) se
// cargan con import() dinámico para no engordar el bundle inicial.
//
// NOTA de paridad: el legacy NO usa SheetJS — exportLeadsToExcel genera un
// .xls como blob HTML (tabla con estilos inline que Excel interpreta). Se
// conserva ese formato para que el archivo descargado sea idéntico.

import type { ClientType } from '@/lib/config/ClientConfigProvider';
import { formatPhone, isQualified, type Lead } from '@/lib/dashboard/filtros';
import { getChartTheme } from '@/lib/charts/temaChart';

/**
 * Captura .main-content y descarga un PDF A4 (port de exportToPDF).
 * El estado del botón (spinner/disabled) lo maneja el caller; en error se
 * muestra el mismo alert del legacy y NO se relanza.
 */
export async function exportToPDF(clientName: string): Promise<void> {
  try {
    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);

    const dashboard = document.querySelector('.main-content') as HTMLElement | null;
    if (!dashboard) return;

    // Temporarily hide elements that shouldn't be in PDF
    const filterTabs = document.querySelector('.table-tabs') as HTMLElement | null;
    const viewAllBtn = document.getElementById('view-all-btn');
    if (filterTabs) filterTabs.style.visibility = 'hidden';
    if (viewAllBtn) viewAllBtn.style.visibility = 'hidden';

    const canvas = await html2canvas(dashboard, {
      scale: 2,
      useCORS: true,
      backgroundColor: getChartTheme().canvasBg,
      logging: false,
    });

    if (filterTabs) filterTabs.style.visibility = 'visible';
    if (viewAllBtn) viewAllBtn.style.visibility = 'visible';

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Reporte_Intra_${clientName}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (err) {
    console.error('PDF Export Error:', err);
    alert('Error al generar el PDF. Inténtalo de nuevo.');
  }
}

/**
 * Descarga los leads calificados como .xls (port de exportLeadsToExcel).
 * `filteredLeads` son los leads ya filtrados globalmente; el filtro de
 * calificados se aplica aquí (igual que el legacy). `dateLabel` — si no se
 * pasa, se lee de #current-range-label como hacía el legacy.
 */
export function exportLeadsToExcel(
  filteredLeads: Lead[],
  opts: { clientName: string; clientType: ClientType; clientId: string | null; dateLabel?: string }
): void {
  const leads = filteredLeads.filter((l) => isQualified(l, opts.clientType, opts.clientId));
  if (!leads || leads.length === 0) {
    alert('No hay leads calificados para exportar.');
    return;
  }

  const esc = (v: any) => {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const clientName = opts.clientName || 'Dashboard';
  const dateLabel = opts.dateLabel ?? (document.getElementById('current-range-label')?.textContent || '');
  const totalLeads = leads.length;
  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const rows = leads
    .map((l, i) => {
      const phone = l.telefono ? formatPhone(l.telefono) : '';
      const fecha = l.fecha_parsed ? l.fecha_parsed.toLocaleDateString('es-MX') : '';
      const isEven = i % 2 === 0;
      const rowBg = isEven ? '#ffffff' : '#f8f9fb';
      return `<tr>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt;">${esc(l.nombre)}</td>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt; mso-number-format:'\\@';">${esc(phone)}</td>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt; text-align:center;">${fecha}</td>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt;">
                <span style="background:#e8f5e9; color:#2e7d32; padding:3px 10px; border-radius:12px; font-size:9pt; font-weight:bold;">${esc(l.estatus)}</span>
            </td>
        </tr>`;
    })
    .join('');

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
    td, th { font-family: Calibri, Arial, sans-serif; }
</style>
</head>
<body>
<table>
    <tr><td colspan="4" style="font-size:16pt; font-weight:bold; padding:12px; color:#1a1a2e;">${esc(clientName)}</td></tr>
    <tr><td colspan="4" style="font-size:10pt; color:#666; padding:4px 12px;">Leads calificados • ${esc(dateLabel)} • Generado: ${today}</td></tr>
    <tr><td colspan="4" style="font-size:10pt; color:#666; padding:4px 12px 12px;">Total: ${totalLeads} leads</td></tr>
    <tr>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:left;">Nombre</th>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:left;">Teléfono</th>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:center;">Fecha</th>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:left;">Estatus</th>
    </tr>
    ${rows}
</table>
</body></html>`;

  // BOM UTF-8 para que Excel respete acentos (igual que el legacy).
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Leads_${opts.clientName || 'export'}_${new Date().toISOString().split('T')[0]}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
