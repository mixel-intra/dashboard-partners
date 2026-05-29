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

const proxyHandler        = require('./api/proxy');
const leadsIngestHandler  = require('./api/leads/ingest');

// Adapta el res de Node.js nativo a la API de Vercel (res.status().json())
function vercelRes(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json   = (data) => {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    return res;
}

// Routea un endpoint /api/* a su handler tipo-Vercel, parseando query y body.
async function callApi(handler, req, res) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    req.query = Object.fromEntries(urlObj.searchParams);

    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try { req.body = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { req.body = {}; }
    }
    return handler(req, vercelRes(res));
}

const server = http.createServer(async (req, res) => {
    // ── /api/proxy ────────────────────────────────────────────
    if (req.url.startsWith('/api/proxy')) {
        return callApi(proxyHandler, req, res);
    }

    // ── /api/leads/ingest ────────────────────────────────────
    if (req.url.startsWith('/api/leads/ingest')) {
        return callApi(leadsIngestHandler, req, res);
    }

    // ── Static files ──────────────────────────────────────────
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    // Clean URLs: equivalente a vercel.json { cleanUrls: true }
    // /lead → /lead.html si no existe el archivo sin extensión.
    let filePath = path.join(ROOT, urlPath);
    if (!path.extname(filePath) && !fs.existsSync(filePath)) {
        const withHtml = filePath + '.html';
        if (fs.existsSync(withHtml)) filePath = withHtml;
    }
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
