import { Suspense } from 'react';
import type { Metadata } from 'next';
import AdminClient from './AdminClient';

export const metadata: Metadata = { title: 'Intra | Consola' };

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminClient />
    </Suspense>
  );
}
