// ILSA Labs — contact endpoint (Vercel serverless function)
// Sends the glass-writer message to CONTACT_TO via Resend, reply-to set to the visitor.
// Env vars required (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  — from resend.com (free tier is fine)
//   CONTACT_TO      — optional, defaults to living@ilsalabs.com
//   CONTACT_FROM    — optional, a verified sender on your Resend domain,
//                     defaults to onboarding@resend.dev (works before domain setup)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name = '', email = '', subject = 'Hello', message = '' } = req.body || {};

  // Basic validation
  if (!message.trim()) return res.status(400).json({ error: 'Empty message' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (message.length > 5000 || name.length > 200 || subject.length > 200) {
    return res.status(400).json({ error: 'Too long' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Not configured' });

  const to = process.env.CONTACT_TO || 'living@ilsalabs.com';
  const from = process.env.CONTACT_FROM || 'ILSA Labs <onboarding@resend.dev>';

  const esc = (t) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[ilsalabs.com] ${subject}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px">
            <p style="color:#8A9099;font-size:12px;letter-spacing:.1em;text-transform:uppercase">
              Glass writer · ilsalabs.com</p>
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
  }
}
