/**
 * Read aloud: POST /api/speech `{ text, voice }` answers one stretch of an agent's reply as WAV, made by
 * Kokoro-82M on the server (server/speech.ts). The browser splits a reply into stretches and asks for the next
 * while the last one plays (src/lib/speech.ts).
 */

/** Kokoro's English voices, best rated first within each accent: `a` American, `b` British; `f` female, `m` male. */
export const SPEECH_VOICES = [
  "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky",
  "am_michael", "am_fenrir", "am_puck", "am_adam", "am_echo", "am_onyx",
  "bf_emma", "bf_isabella", "bm_george", "bm_fable", "bm_lewis", "bm_daniel",
] as const;
export type SpeechVoice = (typeof SPEECH_VOICES)[number];
export const SPEECH_DEFAULT_VOICE: SpeechVoice = "af_bella";

/** The longest stretch one request may carry; the browser's stretches stay well under it. */
export const SPEECH_MAX_CHARS = 1000;

export interface SpeechRequest { text: string; voice: SpeechVoice }
