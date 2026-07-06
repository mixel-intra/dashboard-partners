'use client';

import '@/styles/admin.css';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { clearSession } from '@/lib/auth/session';
import TablaClientes from '@/components/admin/TablaClientes';
import TablaUsuarios from '@/components/admin/TablaUsuarios';
import FormularioCliente from '@/components/admin/FormularioCliente';
import FormularioUsuario from '@/components/admin/FormularioUsuario';
import type { ClienteRegistro, UsuarioResumen } from '@/components/admin/tipos';

// Consola de administración — port de legacy/admin.html + legacy/src/backoffice.js.
// Solo Intra: useRequireAuth redirige a /hub si role !== 'admin'.

type Editor =
  | { modo: 'ninguno' }
  | { modo: 'cliente'; clientId: string | null; config: any; llave: number }
  | { modo: 'usuario'; userId: string | null; llave: number };

export default function AdminClient() {
  return <AuthGuard>{() => <AdminContent />}</AuthGuard>;
}

function AdminContent() {
  const router = useRouter();
  const [tab, setTab] = useState<'clients' | 'users'>('clients');
  const [clients, setClients] = useState<ClienteRegistro[]>([]);
  const [users, setUsers] = useState<UsuarioResumen[] | null>(null);
  const [currentClientId, setCurrentClientId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>({ modo: 'ninguno' });
  const [saveStatusVisible, setSaveStatusVisible] = useState(false);
  const llaveRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clase de página para el CSS scoped (patrón de HubClient).
  useEffect(() => {
    document.documentElement.classList.add('pg-admin');
    return () => document.documentElement.classList.remove('pg-admin');
  }, []);

  // init(): carga el registry y respeta ?client= en la URL.
  useEffect(() => {
    (async () => {
      try {
        await loadRegistry();
      } catch (err) {
        console.error('Initial load failed:', err);
      }
      const clientId = new URLSearchParams(window.location.search).get('client');
      if (clientId) selectClient(clientId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRegistry() {
    const { data, error } = await getAdminSupabase()
      .from('clients_config')
      .select('id_slug, webhook_url, client_type, logo_url');

    if (error) {
      console.error('Error loading registry:', error);
      return;
    }
    setClients((data as ClienteRegistro[]) || []);
  }

  async function selectClient(clientId: string) {
    setCurrentClientId(clientId);

    const { data: config, error } = await getAdminSupabase()
      .from('clients_config')
      .select('*')
      .eq('id_slug', clientId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found
      console.error('Error fetching client config:', error);
      return;
    }

    const currentConfig = config || {
      webhook_url: '',
      investment: 0,
      sales_goal: 0,
      ad_investment: 0,
    };
    // El editor de plantilla necesita el id_slug del cliente seleccionado
    // para generar URLs aunque la config sea nueva.
    if (!currentConfig.id_slug) currentConfig.id_slug = clientId;

    llaveRef.current += 1;
    setEditor({ modo: 'cliente', clientId, config: currentConfig, llave: llaveRef.current });

    // Update URL (igual que el pushState del legacy)
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('client', clientId);
    window.history.pushState({}, '', newUrl);
  }

  // Add Client Flow
  function agregarCliente() {
    setCurrentClientId(null);
    llaveRef.current += 1;
    setEditor({ modo: 'cliente', clientId: null, config: {}, llave: llaveRef.current });
  }

  async function loadUsers() {
    const { data } = await getAdminSupabase()
      .from('user_profiles')
      .select('id, name, email, role, is_active')
      .order('created_at', { ascending: false });
    setUsers((data as UsuarioResumen[]) || []);
  }

  // switchTab() del legacy: cambiar de pestaña siempre regresa al placeholder.
  function cambiarTab(nueva: 'clients' | 'users') {
    setTab(nueva);
    setEditor({ modo: 'ninguno' });
    if (nueva === 'users') loadUsers();
  }

  function seleccionarUsuario(userId: string) {
    setCurrentUserId(userId);
    llaveRef.current += 1;
    setEditor({ modo: 'usuario', userId, llave: llaveRef.current });
  }

  function nuevoUsuario() {
    setCurrentUserId(null);
    llaveRef.current += 1;
    setEditor({ modo: 'usuario', userId: null, llave: llaveRef.current });
  }

  // Post-guardado de cliente: muestra "CAMBIOS GUARDADOS" 3s, recarga registry
  // y re-selecciona (repuebla el formulario desde la BD, como el legacy).
  async function handleClientSaved(clientId: string) {
    setSaveStatusVisible(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatusVisible(false), 3000);
    await loadRegistry();
    await selectClient(clientId);
  }

  // Tras el scrape manual: refresca config visible (last_scraped_at).
  async function handleReselect(clientId: string) {
    await loadRegistry();
    await selectClient(clientId);
  }

  async function handleClientDeleted() {
    await loadRegistry();
    setCurrentClientId(null);
    setEditor({ modo: 'ninguno' });
  }

  function handleUserSaved(userId: string) {
    setCurrentUserId(userId);
    loadUsers();
  }

  async function handleUserDeleted() {
    setCurrentUserId(null);
    setEditor({ modo: 'ninguno' });
    await loadUsers();
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const panelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    padding: '9px 9px 0',
    minHeight: 0,
  };

  return (
    <div className="shell">
      {/* ============================================================ HEADER */}
      <header className="hdr">
        <a href="#" className="hdr-logo">
          <span className="hdr-wordmark">INTRA</span>
          <span className="hdr-badge">Consola</span>
        </a>
        <div className="hdr-spacer"></div>
        <a href="/hub" className="hdr-chip">
          <ion-icon name="apps-outline"></ion-icon> Hub
        </a>
        <div className="hdr-sep"></div>
        <button onClick={logout} className="hdr-chip danger">
          <ion-icon name="power-outline"></ion-icon> Salir
        </button>
      </header>

      {/* ============================================================ BODY ROW */}
      <div className="body-row">
        {/* ================================================== SIDEBAR */}
        <aside className="sidebar">
          {/* Pill tabs */}
          <div className="sb-tabs">
            <button
              id="tab-clients"
              className={`sb-tab ${tab === 'clients' ? 'active' : ''}`}
              onClick={() => cambiarTab('clients')}
            >
              <ion-icon name="server-outline"></ion-icon> Entornos
            </button>
            <button
              id="tab-users"
              className={`sb-tab ${tab === 'users' ? 'active' : ''}`}
              onClick={() => cambiarTab('users')}
            >
              <ion-icon name="people-outline"></ion-icon> Accesos
            </button>
          </div>

          {/* Clients panel */}
          <div id="sidebar-clients-panel" className={tab === 'clients' ? '' : 'hidden'} style={panelStyle}>
            <TablaClientes
              clients={clients}
              currentClientId={currentClientId}
              onSelect={selectClient}
              onAdd={agregarCliente}
            />
          </div>

          {/* Users panel */}
          <div id="sidebar-users-panel" className={tab === 'users' ? '' : 'hidden'} style={panelStyle}>
            <TablaUsuarios
              users={users}
              currentUserId={currentUserId}
              onSelect={seleccionarUsuario}
              onAdd={nuevoUsuario}
            />
          </div>
        </aside>

        {/* ================================================ WORKSPACE */}
        <main className="workspace">
          {/* Empty / placeholder state */}
          {editor.modo === 'ninguno' && (
            <div id="editor-placeholder" style={{ display: 'flex' }}>
              <div className="empty-orb">
                <ion-icon name="planet-outline"></ion-icon>
              </div>
              <h3>Selecciona un entorno</h3>
              <p>Elige un entorno o usuario desde la barra lateral para iniciar la configuración.</p>
            </div>
          )}

          {/* Client editor */}
          {editor.modo === 'cliente' && (
            <FormularioCliente
              key={editor.llave}
              clientId={editor.clientId}
              config={editor.config}
              saveStatusVisible={saveStatusVisible}
              onSaved={handleClientSaved}
              onReselect={handleReselect}
              onDeleted={handleClientDeleted}
            />
          )}

          {/* User editor */}
          {editor.modo === 'usuario' && (
            <FormularioUsuario
              key={editor.llave}
              userId={editor.userId}
              onSaved={handleUserSaved}
              onDeleted={handleUserDeleted}
            />
          )}
        </main>
      </div>
    </div>
  );
}
