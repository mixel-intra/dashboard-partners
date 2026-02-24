// api/proxy.js
// Proxy serverless para evitar errores de CORS con webhooks de n8n

module.exports = async function handler(req, res) {
    // Preflight OPTIONS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'No se proporcionó una URL' });
    }

    try {
        const targetUrl = decodeURIComponent(url);
        console.log('Proxying to:', targetUrl);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Vercel-Proxy/1.0'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Error del webhook: ' + response.statusText,
                status: response.status
            });
        }

        const data = await response.json();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        return res.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
