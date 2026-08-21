// Single pin for the ElevenLabs browser client.
// Bump CLIENT_VERSION here only. Then test Talk to ILSA on desktop and a phone
// before deploy. Never import the unversioned esm.sh URL — it tracks latest
// and can change the default transport (WebRTC vs WebSocket) without warning.
export const ILSA_CLIENT_VERSION = "1.21.0";
export const ILSA_CONNECTION_TYPE = "websocket";
// SDK default is android: 3000. That made Talk to ILSA feel late.
export const ILSA_CONNECTION_DELAY = { android: 400, ios: 150, default: 0 };

export { Conversation } from "https://esm.sh/@elevenlabs/client@1.21.0";
// Same module instance the client uses, so the stashed Safari AudioContext is shared.
export { unlockIosAudioForSession as unlockILSAAudio } from "https://esm.sh/@elevenlabs/client@1.21.0/es2022/dist/platform/web/audioUnlock.mjs";
