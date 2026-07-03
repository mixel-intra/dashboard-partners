import '@/styles/theme-intra.css';
import '@/styles/style.css';

// Placeholder del dashboard (Fase 8). Importa el CSS compartido para validar
// en Fase 0 que fonts/tokens/theme cargan sin flash.
export default function DashboardPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display, Inter)', color: 'var(--text-primary)' }}>
        Dashboard partners — migración a Next.js en progreso
      </h1>
      <p style={{ color: 'var(--text-secondary)' }}>
        Fase 0: scaffold. Este placeholder se reemplaza en la Fase 8.
      </p>
    </div>
  );
}
