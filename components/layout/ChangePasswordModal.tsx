'use client';

import { useEffect, useRef, useState } from 'react';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { getSession, saveSession } from '@/lib/auth/session';

// Modal de cambio de contraseña — port del markup duplicado en legacy
// (login.html / index.html / director.html…), ahora un solo componente.
// Igual que el legacy: update de user_profiles.password en texto plano
// (hardening = follow-up) y refresh del timestamp de sesión (semántica auth.js).

export default function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(false);
      setSaving(false);
      setDone(false);
      formRef.current?.reset();
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const newPass = (form.elements.namedItem('new-password') as HTMLInputElement).value.trim();
    const confirmPass = (form.elements.namedItem('confirm-password') as HTMLInputElement).value.trim();

    setError(null);
    if (newPass.length < 6) return setError('Mínimo 6 caracteres');
    if (newPass !== confirmPass) return setError('Las contraseñas no coinciden');

    setSaving(true);
    try {
      const session = getSession();
      if (!session || !session.id) throw new Error('Sesión expirada. Por favor reingresa.');

      const supabase = getAdminSupabase();
      const { error: upErr } = await supabase
        .from('user_profiles')
        .update({ password: newPass })
        .eq('id', session.id);
      if (upErr) throw upErr;

      const { timestamp: _t, ...rest } = session;
      saveSession(rest);

      setSuccess(true);
      setDone(true);
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err.message || 'Error al actualizar');
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    color: '#fff',
    fontSize: '1rem',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 8,
  };

  return (
    <div
      id="change-pass-modal"
      style={{
        display: 'flex',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="modal-content"
        style={{
          background: 'rgba(10,8,30,0.85)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 32,
          borderRadius: 24,
          width: '100%',
          maxWidth: 400,
          position: 'relative',
        }}
      >
        <button
          data-cerrar
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1.5rem',
          }}
          aria-label="Cerrar"
        >
          <ion-icon name="close-outline"></ion-icon>
        </button>
        <h2 style={{ fontSize: '1.5rem', marginBottom: 8, color: '#fff' }}>Cambiar Contraseña</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginBottom: 24 }}>
          Actualiza tu clave de acceso al portal.
        </p>
        <form id="change-pass-form" ref={formRef} onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Nueva Contraseña</label>
            <input type="password" name="new-password" required placeholder="••••••••" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Confirmar Contraseña</label>
            <input
              type="password"
              name="confirm-password"
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
          {error && (
            <div style={{ color: '#ff4444', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>
          )}
          {success && (
            <div style={{ color: '#10B981', fontSize: '0.85rem', marginBottom: 16 }}>
              Contraseña actualizada correctamente
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              padding: 14,
              background: done ? '#30D158' : 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 12,
              color: '#fff',
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              fontSize: '0.95rem',
              fontFamily: "'Inter',sans-serif",
              boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
            }}
          >
            {done ? '¡Listo!' : saving ? 'Actualizando...' : 'Actualizar Clave'}
          </button>
        </form>
      </div>
    </div>
  );
}
