import { Suspense } from 'react';
import type { Metadata } from 'next';
import HubClient from './HubClient';

export const metadata: Metadata = { title: 'Hub | Dashboard Partners' };

export default function HubPage() {
  return (
    <Suspense fallback={null}>
      <HubClient />
    </Suspense>
  );
}
