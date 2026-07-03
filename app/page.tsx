import { Suspense } from 'react';
import type { Metadata } from 'next';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = { title: 'Dashboard partners | Client Dashboard' };

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardClient />
    </Suspense>
  );
}
