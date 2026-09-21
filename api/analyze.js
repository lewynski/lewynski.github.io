/**
 * Vercel serverless function: /api/analyze
 *
 * Threat analysis endpoint. Keeps the VirusTotal API key server-side.
 * Set VIRUSTOTAL_API_KEY in Vercel: Project -> Settings -> Environment Variables.
 *
 * The client POSTs { url: "...", mode: "url|message" } and gets back
 * { score: 0-100, level: "critical|high|medium|low", vt_data: {...} } or { error: "..." }.
 */

const MAX_CHARS = 2000;

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const configured = process.env.ALLOWED_ORIGINS;
  if (!configured) return true;
  return configured
    .split(',')
    .map(function (o) { return o.trim().replace(/\/$/, ''); })
    .filter(Boolean)
    .includes(origin.replace(/\/$/, ''));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  const vtApiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!vtApiKey) {
    return res.status(500).json({
      error: 'Server is missing VIRUSTOTAL_API_KEY. Add it in the Vercel project environment variables.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ error: 'Body must be valid JSON.' });
    }
  }

  const { url, mode } = body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Expected "url" as a non-empty string.' });
  }

  if (!mode || !['url', 'message'].includes(mode)) {
    return res.status(400).json({ error: 'Expected "mode" to be "url" or "message".' });
  }

  const input = url.slice(0, MAX_CHARS);

  // For URL mode, query VirusTotal
  if (mode === 'url') {
    try {
      const response = await fetch('https://www.virustotal.com/api/v3/urls', {
        method: 'POST',
        headers: {
          'x-apikey': vtApiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'url=' + encodeURIComponent(input)
      });

      const data = await response.json().catch(function () {
        return null;
      });

      if (!response.ok) {
        const detail = (data && data.error && data.error.message) || 'VirusTotal request failed.';
        const status = response.status === 401 || response.status === 429 ? response.status : 502;
        return res.status(status).json({ error: detail });
      }

      const stats = (data && data.data && data.data.attributes && data.data.attributes.last_analysis_stats) || {};
      const malicious = stats.malicious || 0;
      const suspicious = stats.suspicious || 0;
      const vtScore = Math.min((malicious * 10) + (suspicious * 5), 100);

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        score: vtScore,
        level: vtScore >= 70 ? 'critical' : vtScore >= 45 ? 'high' : vtScore >= 20 ? 'medium' : 'low',
        vt_data: {
          malicious: malicious,
          suspicious: suspicious,
          undetected: stats.undetected || 0,
          harmless: stats.harmless || 0
        }
      });
    } catch (err) {
      console.error('analyze proxy error:', err);
      return res.status(500).json({ error: 'Could not reach VirusTotal service.' });
    }
  }

  // For message mode, return empty vt_data (local analysis only)
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    score: 0,
    level: 'low',
    vt_data: null
  });
};
