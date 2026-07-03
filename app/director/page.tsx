import { Suspense } from 'react';
import type { Metadata } from 'next';
import DirectorClient from './DirectorClient';

export const metadata: Metadata = { title: 'Logic Systems · Panel del Director General' };

export default function DirectorPage() {
  return (
    <Suspense fallback={null}>
      <DirectorClient />
    </Suspense>
  );
}
