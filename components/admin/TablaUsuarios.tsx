'use client';

import type { UsuarioResumen } from './tipos';

// Panel lateral de usuarios — port de loadUsers() de legacy/src/backoffice.js.

export default function TablaUsuarios({
  users,
  currentUserId,
  onSelect,
  onAdd,
}: {
  users: UsuarioResumen[] | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <button id="add-user-btn" className="sb-add-btn" onClick={onAdd}>
        <ion-icon name="person-add-outline"></ion-icon> Registrar Acceso
      </button>
      <div className="sb-section-lbl">Usuarios</div>
      <div id="users-list" className="sb-list">
        {!users || users.length === 0 ? (
          <p style={{ padding: 20, color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', textAlign: 'center' }}>
            No hay usuarios aún.
          </p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className={`client-item ${u.id === currentUserId ? 'active' : ''}`}
              onClick={() => onSelect(u.id)}
            >
              <div>
                <div className="client-id-label">{u.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{u.email}</div>
              </div>
              <span className="client-meta">
                {u.role === 'admin' ? '👑' : '👤'} {u.role}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
