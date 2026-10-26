import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useRef } from "react";

import { useT } from "../lib/i18n.ts";
import { dismissPiVoice, endPiVoice, piVoiceLevels, setPiVoiceMuted, usePiVoice, type PiVoiceEnd, type PiVoiceState } from "../lib/piVoiceSession.ts";
import { usePhoneSheetBack } from "../lib/sheetHistory.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";
import { VoiceOrb } from "./VoiceOrb.tsx";
import "./PiVoiceView.css";

/**
 * The full-screen live voice call with a Pi pane: the orb, what was said, Mute and End. It
 * follows the ChatGPT app's voice mode for the layout (one orb, mute and end within thumb reach)
 * and the agents app for the orb. It is a call, not a floating dock, so Mute and End are always
 * there and the last words of both sides stay on screen. Mounted once in App; shown while a call
 * is starting, on, or over with something to read.
 */
export function PiVoiceView() {
  const voice = usePiVoice();
  return voice.status === "idle" ? null : <PiVoiceDialog voice={voice} />;
}

function PiVoiceDialog({ voice }: { voice: PiVoiceState }) {
  const t = useT();
  const over = voice.status === "ended";
  const primary = useRef<HTMLButtonElement>(null);
  const surface = useFocusTrap<HTMLDivElement>(true, { initialFocus: primary });
  // the phone's Back is the way out of a call, as it is out of any sheet
  usePhoneSheetBack(over ? dismissPiVoice : endPiVoice);
  const status = over ? "" : phaseText(voice, t);
  return (
    <div className="pi-voice" role="dialog" aria-modal="true" aria-label={t("Live voice")} ref={surface} tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape") (over ? dismissPiVoice : endPiVoice)(); }}>
      <header className="pi-voice-header">
        <span className="pi-voice-label">{voice.label}</span>
        <span className="pi-voice-status" aria-live="polite">{status}</span>
      </header>
      <div className={`pi-voice-stage is-${over ? "over" : voice.phase}`}>
        <VoiceOrb phase={over ? "ended" : voice.phase} levels={piVoiceLevels} />
      </div>
      {over ? (
        <>
          <p className="pi-voice-end" role="alert">{endText(voice.end, t)}</p>
          <div className="pi-voice-controls">
            <button type="button" className="btn" ref={primary} onClick={dismissPiVoice}>{t("Close")}</button>
          </div>
        </>
      ) : (
        <>
          <div className="pi-voice-transcript" aria-live="polite">
            {voice.userText !== "" && <p className="pi-voice-line is-user"><span className="visually-hidden">{t("You said")}: </span>{voice.userText}</p>}
            {voice.assistantText !== "" && <p className="pi-voice-line is-assistant"><span className="visually-hidden">{t("Pi said")}: </span>{voice.assistantText}</p>}
          </div>
          <div className="pi-voice-controls">
            <button type="button" className="pi-voice-button" aria-pressed={voice.muted} aria-label={voice.muted ? t("Unmute") : t("Mute")}
              title={voice.muted ? t("Unmute") : t("Mute")} disabled={voice.status !== "live"} onClick={() => setPiVoiceMuted(!voice.muted)}>
              {voice.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
            </button>
            <button type="button" className="pi-voice-button is-end" ref={primary} aria-label={t("End call")} title={t("End call")} onClick={endPiVoice}>
              <PhoneOff aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function phaseText(voice: PiVoiceState, t: ReturnType<typeof useT>): string {
  if (voice.status === "starting") return t("Connecting…");
  switch (voice.phase) {
    case "listening": return t("Listening");
    case "working": return t("Working on it");
    case "speaking": return t("Speaking");
    case "muted": return t("Muted");
    default: return t("Connecting…");
  }
}

function endText(end: PiVoiceEnd | null, t: ReturnType<typeof useT>): string {
  switch (end?.kind) {
    case "error": return end.message;
    case "denied": return t("Microphone access was denied.");
    case "no_mic": return t("No microphone found");
    case "unsupported": return t("This browser cannot make a voice call.");
    case "failed": return t("The call stopped working.");
    case "not_pi": return t("This pane is not running Pi.");
    case "unavailable": return t("Pi did not answer in this pane. Run /reload in Pi and try again.");
    case "busy": return t("A call is already on in this pane.");
    default: return t("The call was cut off.");
  }
}
