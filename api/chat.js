/**
 * Vercel serverless function: /api/chat
 *
 * Keeps the Groq API key on the server. The browser never sees it.
 * Set GROQ_API_KEY in Vercel: Project -> Settings -> Environment Variables.
 *
 * The client POSTs { messages: [{role, content}, ...] } and gets back
 * { reply: "..." } or { error: "..." }.
 */

/* llama-3.1-8b-instant was decommissioned; Groq answers retired models with a
   404 model_not_found. Override with a MODEL env var if you want to swap it
   without editing code. Check console.groq.com/docs/deprecations if this 404s. */
const MODEL = process.env.MODEL || 'openai/gpt-oss-20b';
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

/* The personas live here, not in the browser, so they cannot be edited client-side.
   The client picks one by name via { persona: 'capy' }; anything unrecognised
   falls back to 'eiji'. Adding a persona here is the only way to add one, which
   is the point -- a page can choose a prompt but cannot write one. */
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

/* CapySave's advisor. The page sends a plain-text spending summary as the user
   turn; this prompt decides what to do with it. Peso amounts, short answers. */
const CAPY_PROMPT = `You are Capy, the AI financial advisor built into CapySave, a Philippine peso budget tracker.
You are a calm, encouraging capybara. You are never harsh about money mistakes.
The user will send you a summary of their budget, balances, spending by category, and savings goal.
Respond with:
1. One sentence on how they are actually doing.
2. One specific, concrete thing to change, naming the category or platform involved.
3. One short "What if" projection -- what happens by month end if the current pace continues.
Rules: keep the whole reply under 4 sentences. Use peso amounts written like P1,250.00. Never use markdown, asterisks, bullet points, or headings. Never invent numbers that were not given to you. If the budget is zero or there are no transactions, say so plainly and tell them what to enter first.`;

const PERSONAS = {
  eiji: SYSTEM_PROMPT,
  capy: CAPY_PROMPT
};

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

  /* Pick the persona by name. Unknown or missing -> the portfolio assistant,
     so index.html keeps working without sending a persona at all. */
  const personaKey = typeof (body && body.persona) === 'string' ? body.persona : 'eiji';
  const systemPrompt = PERSONAS[personaKey] || PERSONAS.eiji;

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }].concat(history),
        temperature: 0.7,
        max_tokens: MAX_TOKENS
      })
    });

    const data = await upstream.json().catch(function () {
      return null;
    });

    if (!upstream.ok) {
      const detail = (data && data.error && data.error.message) || 'Upstream request failed.';
      /* Never echo the key or raw upstream headers back to the browser.
         Do NOT forward the upstream status verbatim: a 404 from Groq (retired model)
         would look identical to "/api/chat does not exist" on the client, which is
         exactly the wrong diagnosis. Collapse all upstream failures to 502 and keep
         401/429 distinguishable since the user can act on those. */
      const status = (upstream.status === 401 || upstream.status === 429) ? upstream.status : 502;
      return res.status(status).json({ error: detail, upstreamStatus: upstream.status });
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
