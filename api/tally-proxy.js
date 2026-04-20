// Vercel Serverless Function — Tally XML Proxy
// Forwards XML payload to a Tally Prime HTTP server.
// POST /api/tally-proxy
// Body: { xml: "<ENVELOPE>...</ENVELOPE>", tallyUrl: "http://host:9000" }
//
// This runs server-side on Vercel, so it can reach the customer's
// Tally server if it's exposed (e.g. via ngrok or a public IP).

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { xml, tallyUrl } = req.body || {};

    if (!xml || typeof xml !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "xml" field. Must be a non-empty string.' });
    }

    if (!tallyUrl || typeof tallyUrl !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "tallyUrl" field.' });
    }

    // Validate URL format — only allow http/https to prevent SSRF to other schemes
    let parsedUrl;
    try {
      parsedUrl = new URL(tallyUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid tallyUrl format.' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'tallyUrl must use http or https protocol.' });
    }

    // Block private/internal IPs to mitigate SSRF (basic check)
    const hostname = parsedUrl.hostname;
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^0\./,
      /^\[::1\]/,
      /^169\.254\./,
    ];

    const isBlocked = blockedPatterns.some((p) => p.test(hostname));
    if (isBlocked) {
      return res.status(400).json({
        error: 'tallyUrl cannot point to localhost or private network addresses. Use a public URL (e.g. ngrok tunnel) to reach your Tally server.',
      });
    }

    // Limit XML payload size (2 MB)
    if (xml.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'XML payload too large. Maximum 2 MB.' });
    }

    // Forward to Tally server
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(parsedUrl.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text();

    return res.status(200).json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: responseText,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Tally server did not respond within 30 seconds.' });
    }

    return res.status(502).json({
      error: 'Failed to reach Tally server.',
      details: err.message,
    });
  }
}
