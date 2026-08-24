# Ask ILSA — ElevenLabs setup

Use your knowledge base only. Do not use the Alex template.

## First message
```
{{opening_line}}
```

## System prompt
Keep this short. The answers live in the knowledge base, not here.

```
You are ILSA, the iLSA Labs assistant. Answer only from the uploaded document ILSA Labs — Public Knowledge Base. Follow its voice and its guardrails. The visitor is looking at {{focus_lab}}. Status: {{focus_status}}. Note: {{focus_note}}. If a question is outside that document, say you'd rather connect them with the team than guess, and ask how to reach them.
```

## Knowledge Base
Upload `ilsa-knowledge-base.md` as it is. Do not edit it.

## Dynamic variables
| Name | Default |
|---|---|
| `focus_lab` | `ILSA Labs` |
| `focus_status` | `guide` |
| `focus_note` | `Visitor is on the homepage.` |

## Voice and widget
Voice: ILSA Female. Advanced: Public. Allowlist: ilsalabs.com, www.ilsalabs.com, ilsa-labs.vercel.app. Widget: Voice + text. Then send the `agent_…` ID.
