'use client';

import { useRequireAuth } from '@/lib/auth/useRequireAuth';
import type { Session } from '@/types/session';

// No renderiza children hasta validar la sesión — evita el flash de contenido
// protegido (en el legacy no existía porque el redirect corría antes del render).
export default function AuthGuard({
  children,
}: {
  children: (session: Session) => React.ReactNode;
}) {
  const auth = useRequireAuth();
  if (auth.status !== 'ok') return null;
  return <>{children(auth.session)}</>;
}
