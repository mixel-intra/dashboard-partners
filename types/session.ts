// Shape EXACTO del blob de sesión en localStorage['intra_session_v2'].
// No cambiar: las sesiones existentes deben sobrevivir el cutover.
export interface Session {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'partner';
  clients: string[];
  timestamp: number;
}
