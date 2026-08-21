// Single pin for the ElevenLabs browser client.
// Bump CLIENT_VERSION here only. Then test Talk to ILSA on desktop and a phone
// before deploy. Never import the unversioned esm.sh URL — it tracks latest
// and can change the default transport (WebRTC vs WebSocket) without warning.
export const ILSA_CLIENT_VERSION = "1.21.0";
export const ILSA_CONNECTION_TYPE = "websocket";

export { Conversation } from "https://esm.sh/@elevenlabs/client@1.21.0";
