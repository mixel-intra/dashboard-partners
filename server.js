// server.js — Dev server local
// Sirve archivos estáticos + maneja /api/proxy igual que Vercel
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.ico':  'image/x-icon',
    '.woff2':'font/woff2',
    '.woff': 'font/woff',
    '.ttf':  'font/ttf',
};

const proxyHandler = require('./api/proxy');

// Adapta el res de Node.js nativo a la API de Vercel (res.status().json())
function vercelRes(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json   = (data) => {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    return res;
}

const server = http.createServer(async (req, res) => {
    // ── /api/proxy ────────────────────────────────────────────
    if (req.url.startsWith('/api/proxy')) {
        const urlObj = new URL(req.url, `http://localhost:${PORT}`);
        req.query = Object.fromEntries(urlObj.searchParams);

        // Parse JSON body for POST/PATCH/PUT
        if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            try { req.body = JSON.parse(Buffer.concat(chunks).toString()); }
            catch { req.body = {}; }
        }

        return proxyHandler(req, vercelRes(res));
    }

    // ── Static files ──────────────────────────────────────────
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found: ' + urlPath);
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n  ✓ Dev server corriendo en http://localhost:${PORT}\n`);
});
