import type { NextConfig } from 'next';

// Red de seguridad para bookmarks y links externos al sitio viejo (cleanUrls).
// Next preserva los query params (?client=, ?id=) automáticamente en el redirect.
// `permanent: false` (307) durante la estabilización post-cutover.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: false },
      { source: '/index', destination: '/', permanent: false },
      { source: '/login.html', destination: '/login', permanent: false },
      { source: '/hub.html', destination: '/hub', permanent: false },
      { source: '/lead.html', destination: '/lead', permanent: false },
      { source: '/pipeline.html', destination: '/pipeline', permanent: false },
      { source: '/director.html', destination: '/director', permanent: false },
      { source: '/admin.html', destination: '/admin', permanent: false },
      { source: '/src/assets/:file*', destination: '/assets/:file*', permanent: false },
    ];
  },
};

export default nextConfig;
