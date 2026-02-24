// api/proxy.js
// Proxy serverless function to bypass CORS restrictions
export default async function handler(req, res) {
    const { url } = req.query;

    // Basic validation
    if (!url) {
        return res.status(400).json({ error: "No se proporcionó una URL" });
    }

    try {
        console.log(`Proxying request to: ${url}`);

        const response = await fetch(decodeURIComponent(url), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Vercel-Proxy'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Error al obtener datos del webhook: ${response.statusText}`,
                status: response.status
            });
        }

        const data = await response.json();

        // Add CORS headers to allow the dashboard to read this response
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
        res.setHeader(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
        );

        return res.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({ error: "Error interno del servidor al procesar la petición proxy" });
    }
}
