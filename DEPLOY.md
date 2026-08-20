# ILSA Labs — Deploy to Vercel

## What's in this folder
- `index.html` — the entire site (lab, prisms, fog, glass writer, Ask ILSA)
- `api/contact.js` — serverless function: silent sending from the glass writer

## Deploy (5 minutes)
1. Push this folder to a GitHub repo (or run `vercel` in it from the CLI, or drag it into vercel.com/new).
2. Vercel auto-detects: static `index.html` + the `api/` function. No build settings needed.
3. Add the domain: Project → Settings → Domains → ilsalabs.com (+ www).

## Wire the contact endpoint (silent sending)
1. Create a free account at resend.com → copy the API key.
2. Vercel → Project → Settings → Environment Variables:
   - `RESEND_API_KEY` = your key   (required)
   - `CONTACT_TO` = human@ilsalabs.com   (optional, this is the default)
   - `CONTACT_FROM` = ILSA Labs <hello@ilsalabs.com>   (optional; requires verifying
     ilsalabs.com in Resend → Domains. Until then the default resend.dev sender works.)
3. Redeploy. Test the writer — message should arrive at human@ilsalabs.com with
   reply-to set to the visitor, so you just hit Reply.

Note: if the endpoint is missing or fails, the writer automatically falls back to
opening the visitor's mail app (mailto), so no lead is ever lost.

## Wire Ask ILSA (voice)
1. elevenlabs.io → Agents → create the agent. Paste the System prompt, first message and dynamic variables from `ask-ilsa-agent-config.md`.
2. Advanced tab: set agent to **Public**. Security tab: Allowlist → add ilsalabs.com, www.ilsalabs.com and ilsa-labs.vercel.app.
3. Widget tab: enable Voice + text so people can talk or type.
4. Copy the agent ID → in `index.html`, replace `YOUR_AGENT_ID`.
5. Set a monthly usage cap in your ElevenLabs account.

The site tells ILSA which lab the visitor opened (`focus_lab`). Ask ILSA about teo starts on teo. Hero and header start on the lab as a whole.

## Before launch checklist
- [ ] Replace `YOUR_AGENT_ID` (Ask ILSA won't appear until you do)
- [ ] Confirm/replace the three placeholder links: otonomy.ai, animalab.com.au, biohack.ilsalabs.com
- [ ] Test the writer end-to-end (chip → send → email arrives → reply works)
- [ ] Open on a phone: fog is desktop-only by design; prisms + writer should feel right
