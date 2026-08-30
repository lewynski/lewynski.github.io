/**
 * Vercel serverless function: /api/chat
 *
 * Keeps the Groq API key on the server. The browser never sees it.
 * Set GROQ_API_KEY in Vercel: Project -> Settings -> Environment Variables.
 *
 * The client POSTs { messages: [{role, content}, ...] } and gets back
 * { reply: "..." } or { error: "..." }.
 */

const MODEL = 'llama-3.1-8b-instant';
const MAX_TOKENS = 220;
const MAX_MESSAGES = 24;      // trim runaway histories
const MAX_CHARS = 4000;       // per message

/**
 * Casual-abuse speed bump only. Browsers set Origin on cross-site POSTs, so this
 * stops a random page from calling your endpoint. It does NOT stop curl or a
 * script, because Origin can be forged outside a browser. If the endpoint starts
 * getting hammered, add a real rate limiter (Vercel KV / Upstash) or an auth token.
 * Set ALLOWED_ORIGINS in Vercel as a comma-separated list to lock it down further.
 */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;            // same-origin fetches often omit it
  const configured = process.env.ALLOWED_ORIGINS;
  if (!configured) return true;        // not configured -> don't block anyone
  return configured
    .split(',')
    .map(function (o) { return o.trim().replace(/\/$/, ''); })
    .filter(Boolean)
    .includes(origin.replace(/\/$/, ''));
}

/* The persona lives here, not in the browser, so it cannot be edited client-side. */
const SYSTEM_PROMPT = `You are Eiji AI, the personal AI assistant for Jon Lewyn Villaram Tanggaro.
You are embedded on his developer portfolio website. Keep answers concise, friendly, and slightly retro/cyberpunk in tone.
Information about Jon Lewyn:
- He is an Electronics Engineering student at Polytechnic University of the Philippines (PUP) Santo Tomas Campus.
- He is a Web Developer bridging hardware and software.
- Skills: Python, JavaScript, HTML/CSS, Java, C++, Arduino Uno, FPGA, AutoCAD, MATLAB, Multisim, Proteus, MS Office, Macro automation.
- Experience: Intern (OJT) at Bandai Wireharness Philippines (developed an automated system using Macro programming). Work Immersion at NOCECO. OJT at G-Connect Systems & Trading Corp. (fiber optics, FTTH, data center and networking, 240 hours).
- Projects: CapySave (virtual wallet monitoring), Capy Save AI, NetWatch (ping monitoring), Retro Snake Game, Floradex (flower wiki), Isdadex, Presyodex, Eiji AI.
- Affiliations: OECES Special Project Officer, IECEP Batangas Student Chapter.
If the user asks about Jon Lewyn, answer accurately from this data. If they just want to chat, be conversational and polite.
Never output code formatting or markdown in your responses.`;

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

  const apiKey = process.env.GROQ_API_KEY;  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing GROQ_API_KEY. Add it in the Vercel project environment variables.'
    });
  }

  /* Vercel usually parses JSON bodies for us; fall back for raw strings. */
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ error: 'Body must be valid JSON.' });
    }
  }

  const incoming = Array.isArray(body && body.messages) ? body.messages : null;
  if (!incoming || incoming.length === 0) {
    return res.status(400).json({ error: 'Expected a non-empty "messages" array.' });
  }

  /* Sanitize: only user/assistant turns, only strings, bounded size.
     The system prompt is injected here so the client cannot override it. */
  const history = incoming
    .filter(function (m) {
      return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
    })
    .slice(-MAX_MESSAGES)
    .map(function (m) {
      return { role: m.role, content: m.content.slice(0, MAX_CHARS) };
    });

  if (history.length === 0) {
    return res.status(400).json({ error: 'No usable user or assistant messages found.' });
  }

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }].concat(history),
        temperature: 0.7,
        max_tokens: MAX_TOKENS
      })
    });

    const data = await upstream.json().catch(function () {
      return null;
    });

    if (!upstream.ok) {
      const detail = (data && data.error && data.error.message) || 'Upstream request failed.';
      /* Never echo the key or raw upstream headers back to the browser. */
      return res.status(upstream.status).json({ error: detail });
    }

    const reply =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;

    if (!reply) {
      return res.status(502).json({ error: 'Model returned an empty response.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reply: reply });
  } catch (err) {
    console.error('chat proxy error:', err);
    return res.status(500).json({ error: 'Could not reach the model service.' });
  }
};
