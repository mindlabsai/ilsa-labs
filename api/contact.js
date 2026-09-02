// ILSA Labs — contact endpoint (Vercel serverless function)
// Sends the glass-writer message to CONTACT_TO via Resend, reply-to set to the visitor.
// Env vars required (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  — from resend.com (free tier is fine)
//   CONTACT_TO      — optional, defaults to human@ilsalabs.com
//   CONTACT_FROM    — optional, a verified sender on your Resend domain,
//                     defaults to onboarding@resend.dev (works before domain setup)

const hits = new Map();

function rateLimit(req, limit = 8, windowMs = 60_000) {
  const ip =
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (body == null) return {};
  if (typeof body !== 'object') return null;
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req)) return res.status(429).json({ error: 'Try again shortly' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Invalid request' });

  const name = String(body.name ?? '');
  const email = String(body.email ?? '');
  const subject = String(body.subject ?? 'Hello');
  const message = String(body.message ?? '');

  // Basic validation
  if (!message.trim()) return res.status(400).json({ error: 'Empty message' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (message.length > 5000 || name.length > 200 || subject.length > 200) {
    return res.status(400).json({ error: 'Too long' });
  }

  let apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Not configured' });
  apiKey = String(apiKey).replace(/\u2022/g, '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Not configured' });

  const to = process.env.CONTACT_TO || 'human@ilsalabs.com';
  const from = process.env.CONTACT_FROM || 'ILSA Labs <onboarding@resend.dev>';

  const esc = (t) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[ilsalabs.com] ${subject}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px">
            <p style="color:#8A9099;font-size:12px;letter-spacing:.1em;text-transform:uppercase">
              ${/engineer/i.test(subject) ? 'Engineer for you · confidential brief' : 'Glass writer · ilsalabs.com'}</p>
            <p><strong>${esc(name || 'No name given')}</strong> · ${esc(email)}</p>
            <p><strong>${esc(subject)}</strong></p>
            <p style="white-space:pre-wrap;line-height:1.6">${esc(message)}</p>
          </div>`,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error:', detail);
      return res.status(502).json({ error: 'Send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Send failed' });
  } finally {
    clearTimeout(timer);
  }
}
