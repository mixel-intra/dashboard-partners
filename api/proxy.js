// api/proxy.js
// Proxy serverless para evitar errores de CORS con webhooks de n8n

module.exports = async function handler(req, res) {
    // Preflight OPTIONS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'No se proporcionó una URL' });
    }

    try {
        const targetUrl = decodeURIComponent(url);
        console.log(`Proxying ${req.method} to:`, targetUrl);

        const fetchOptions = {
            method: req.method,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Vercel-Proxy/1.0'
            }
        };

        // Para POST, enviar el body como JSON
        if (req.method === 'POST') {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);
        const responseText = await response.text();

        if (!response.ok) {
            console.error('Webhook error:', response.status, responseText.substring(0, 500));
            return res.status(response.status).json({
                error: 'Error del webhook: ' + response.statusText,
                status: response.status,
                detail: responseText.substring(0, 500)
            });
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr.message, responseText.substring(0, 500));
            return res.status(502).json({
                error: 'La respuesta del webhook no es JSON válido',
                detail: responseText.substring(0, 200)
            });
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        return res.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error:', error.message, error.stack);
        return res.status(500).json({ error: error.message, type: error.name });
    }
}
