'use client';

import { useEffect, useState } from 'react';
import { getAdminSupabase } from '@/lib/supabase/adminClient';

// Editor de usuarios (accesos) — port del módulo de gestión de usuarios de
// legacy/src/backoffice.js: user_profiles + user_client_access, checkboxes de
// entornos, generador de contraseña, revocar acceso y correo de bienvenida.

interface ClienteCheckbox {
  id_slug: string;
  name: string;
}

// El legacy cachea la lista de clientes en una global (allClients) — módulo-level
// para sobrevivir remounts, igual que la página legacy que nunca la recargaba.
let cacheClientes: ClienteCheckbox[] = [];

async function obtenerClientes(): Promise<ClienteCheckbox[]> {
  if (cacheClientes.length === 0) {
    const { data } = await getAdminSupabase().from('clients_config').select('id_slug, name');
    cacheClientes = (data as ClienteCheckbox[]) || [];
  }
  return cacheClientes;
}

// --- Generar contraseña (port de generateUserPass) ---
function generarPass(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function FormularioUsuario({
  userId,
  onSaved,
  onDeleted,
}: {
  userId: string | null; // null = nuevo usuario
  onSaved: (id: string) => void; // recarga la lista lateral + highlight
  onDeleted: () => void;
}) {
  // '' equivale al hidden #user-id vacío del legacy (→ INSERT)
  const [id, setId] = useState(userId || '');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('partner');
  const [badge, setBadge] = useState('Partner');
  const [titulo, setTitulo] = useState(userId ? 'Registrar Llave' : 'Nuevo Usuario');
  const [clientes, setClientes] = useState<ClienteCheckbox[]>([]);
  const [asignados, setAsignados] = useState<Set<string>>(new Set());
  const [mostrarEliminar, setMostrarEliminar] = useState(false);
  const [mostrarCopiarCorreo, setMostrarCopiarCorreo] = useState(false);
  const [guardadoVisible, setGuardadoVisible] = useState(false);
  const [correoCopiadoVisible, setCorreoCopiadoVisible] = useState(false);

  // Carga inicial: checkboxes de clientes + (si aplica) usuario existente.
  useEffect(() => {
    (async () => {
      const lista = await obtenerClientes();
      setClientes(lista);
      if (!userId) return;

      const { data: user } = await getAdminSupabase()
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!user) return;

      const { data: access } = await getAdminSupabase()
        .from('user_client_access')
        .select('client_slug')
        .eq('user_id', userId);

      setId(user.id);
      setNombre(user.name);
      setEmail(user.email);
      setPassword(user.password);
      setRol(user.role);
      setBadge(user.role === 'admin' ? 'Administrador' : 'Partner');
      setTitulo(user.name);
      setMostrarEliminar(true);
      setMostrarCopiarCorreo(true);
      setAsignados(new Set(((access || []) as any[]).map((a) => a.client_slug)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function toggleAcceso(slug: string) {
    setAsignados((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // --- Guardar usuario (port del submit de #user-form) ---
  async function guardar(e: React.FormEvent) {
    e.preventDefault();

    const name = nombre.trim();
    const emailVal = email.trim();
    const passwordVal = password.trim();
    const role = rol;

    // En orden DOM (orden de la lista de clientes), como los checkboxes del legacy
    const selectedClients = clientes.filter((c) => asignados.has(c.id_slug)).map((c) => c.id_slug);

    try {
      let finalUserId = id;

      if (id) {
        // UPDATE
        await getAdminSupabase()
          .from('user_profiles')
          .update({ name, email: emailVal, password: passwordVal, role })
          .eq('id', id);
      } else {
        // INSERT
        const { data: newUser, error } = await getAdminSupabase()
          .from('user_profiles')
          .insert({ name, email: emailVal, password: passwordVal, role })
          .select('id')
          .single();

        if (error) throw error;
        finalUserId = newUser.id;
        setId(finalUserId);
      }

      // Actualizar accesos: borrar los anteriores e insertar los nuevos
      await getAdminSupabase().from('user_client_access').delete().eq('user_id', finalUserId);

      if (selectedClients.length > 0) {
        const accessRows = selectedClients.map((slug) => ({
          user_id: finalUserId,
          client_slug: slug,
        }));
        await getAdminSupabase().from('user_client_access').insert(accessRows);
      }

      setGuardadoVisible(true);
      setTitulo(name);
      setMostrarCopiarCorreo(true);
      onSaved(finalUserId);
    } catch (err: any) {
      console.error('Error guardando usuario:', err);
      alert('Error: ' + (err.message || 'No se pudo guardar el usuario'));
    }
  }

  // --- Eliminar usuario (port de deleteUser) ---
  async function eliminar() {
    if (!id) return;
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    await getAdminSupabase().from('user_profiles').delete().eq('id', id);
    onDeleted();
  }

  // --- Copiar Correo de Bienvenida ---
  function copiarBienvenida() {
    const name = nombre.trim();
    const emailVal = email.trim();
    const passwordVal = password.trim();
    const loginUrl = `${window.location.origin}/login`;

    const emailTemplate = `
Hola ${name},

¡Bienvenido a tu Dashboard de Partners!

Te escribo para informarte que hemos generado tus credenciales de acceso para que puedas comenzar a visualizar tus métricas y leads en tiempo real.

Tus datos de acceso son:
------------------------------------------
📧 Correo: ${emailVal}
🔑 Contraseña: ${passwordVal}
------------------------------------------

Puedes acceder desde el siguiente enlace:
${loginUrl}

Si tienes alguna duda con el uso de la plataforma, por favor házmelo saber.

Saludos.
    `.trim();

    navigator.clipboard.writeText(emailTemplate).then(() => {
      setCorreoCopiadoVisible(true);
      setTimeout(() => setCorreoCopiadoVisible(false), 3000);
    });
  }

  return (
    <div id="user-editor" className="animate-fade editor-wrap">
      {/* Topbar */}
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          <div className="editor-eyebrow">
            <ion-icon name="key-outline"></ion-icon> Gestión de Acceso
          </div>
          <h2 id="user-editor-title" className="editor-title">
            {titulo}
          </h2>
        </div>
        <div className="editor-topbar-right">
          <span id="user-role-badge">{badge}</span>
        </div>
      </div>

      {/* Scrollable form body */}
      <form id="user-form" onSubmit={guardar}>
        <div className="editor-body">
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <p id="user-save-status" className="success-msg" style={{ display: guardadoVisible ? 'block' : 'none' }}>
              CREDENCIALES GUARDADAS
            </p>
            <p
              id="email-copy-status"
              className="success-msg"
              style={{
                color: 'var(--blue)',
                background: 'var(--blue-bg)',
                borderColor: 'rgba(122,184,255,0.28)',
                display: correoCopiadoVisible ? 'block' : 'none',
              }}
            >
              CORREO COPIADO
            </p>
          </div>

          {/* Identidad del usuario */}
          <div className="sc sc-accent-purple">
            <div className="sc-head">
              <div className="sc-icon sci-purple">
                <ion-icon name="finger-print-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Credenciales</span>
                <span className="sc-title">Identidad del Usuario</span>
              </div>
            </div>
            <div className="sc-body">
              <div className="fg" style={{ rowGap: 18 }}>
                <div className="fg-group">
                  <label className="fgl" htmlFor="user-name">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    id="user-name"
                    className="fi"
                    placeholder="Nombre del operador"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="user-email">
                    Email
                  </label>
                  <input
                    type="email"
                    id="user-email"
                    className="fi"
                    placeholder="correo@ejemplo.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="user-password">
                    Contraseña
                  </label>
                  <div className="fi-action-row">
                    <input
                      type="text"
                      id="user-password"
                      className="fi"
                      placeholder="••••••••"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(generarPass())}
                      className="btn btn-ghost btn-icon"
                      title="Generar contraseña automática"
                      style={{ borderRadius: 8, flexShrink: 0 }}
                    >
                      <ion-icon name="flash-outline"></ion-icon>
                    </button>
                  </div>
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="user-role">
                    Rol
                  </label>
                  <select
                    id="user-role"
                    className="fi"
                    value={rol}
                    onChange={(e) => {
                      setRol(e.target.value);
                      // El legacy pone en el badge el texto de la opción elegida
                      setBadge(e.target.options[e.target.selectedIndex].text);
                    }}
                  >
                    <option value="partner">LECTURA (Partner)</option>
                    <option value="admin">ROOT (Administrador)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Permisos / entornos asignados */}
          <div className="sc sc-accent-green">
            <div className="sc-head">
              <div className="sc-icon sci-green">
                <ion-icon name="git-network-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Permisos</span>
                <span className="sc-title">Entornos Asignados</span>
              </div>
            </div>
            <div className="sc-body">
              <p className="hint" style={{ marginBottom: 13 }}>
                Selecciona los entornos a los que este usuario puede acceder. Los administradores
                ROOT tienen acceso completo automáticamente.
              </p>
              <div id="client-checkboxes" className="checkbox-grid">
                {clientes.map((client) => {
                  const isChecked = asignados.has(client.id_slug);
                  return (
                    <label
                      key={client.id_slug}
                      className={`client-checkbox-card ${isChecked ? 'checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        name="client_access"
                        value={client.id_slug}
                        checked={isChecked}
                        onChange={() => toggleAcceso(client.id_slug)}
                      />
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{client.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Sticky footer */}
      <div className="actions-footer">
        <button
          type="button"
          id="delete-user-btn"
          className={`btn btn-danger ${mostrarEliminar ? '' : 'hidden'}`}
          onClick={eliminar}
        >
          <ion-icon name="close-circle-outline"></ion-icon> Revocar Acceso
        </button>
        <div className="footer-right">
          <button
            type="button"
            id="copy-welcome-email-btn"
            className={`btn btn-ghost ${mostrarCopiarCorreo ? '' : 'hidden'}`}
            onClick={copiarBienvenida}
          >
            Copiar Bienvenida <ion-icon name="mail-outline"></ion-icon>
          </button>
          <button type="submit" form="user-form" className="btn btn-primary">
            Guardar Usuario <ion-icon name="checkmark-outline"></ion-icon>
          </button>
        </div>
      </div>
    </div>
  );
}
