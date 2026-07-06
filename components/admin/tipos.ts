// Tipos y utilidades compartidas del back office /admin.
// Port de legacy/src/backoffice.js + legacy/src/lead-template-editor.js.

export interface ClienteRegistro {
  id_slug: string;
  webhook_url: string | null;
  client_type: string | null;
  logo_url: string | null;
}

export interface UsuarioResumen {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean | null;
}

// Campos del editor de plantilla de lead tal como viven en el formulario
// (strings crudos de los inputs; qualified stages separadas por coma).
export interface PlantillaCampos {
  tplHtml: string;
  tplLeadIdField: string;
  tplSucursalField: string;
  tplEstatusField: string;
  tplQualifiedStages: string;
}

// Equivalente 1:1 a window.LeadTemplateEditor.serialize() del legacy —
// produce el JSON que se guarda en clients_config.lead_template.
export function serializarPlantilla(c: PlantillaCampos) {
  const stages = (c.tplQualifiedStages || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    html: c.tplHtml || '',
    lead_id_field: c.tplLeadIdField.trim() || 'id',
    sucursal_field: c.tplSucursalField.trim() || 'sucursal',
    estatus_field: c.tplEstatusField.trim() || 'estatus',
    qualified_stages: stages,
  };
}
