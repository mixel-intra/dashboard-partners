import { Suspense } from 'react';
import type { Metadata } from 'next';
import PipelineClient from './PipelineClient';

export const metadata: Metadata = { title: 'Pipeline de Cotizaciones | Dashboard Partners' };

export default function PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineClient />
    </Suspense>
  );
}
