import { ChevronDown, Mic, MicOff, PhoneOff } from "lucide-react";
import { useRef } from "react";

import { useT } from "../lib/i18n.ts";
import { useOrbDrag } from "../lib/orbDrag.ts";
import {
  dismissPiVoice,
  endPiVoice,
  piVoiceLevels,
  setPiVoiceExpanded,
  setPiVoiceMuted,
  usePiVoice,
  usePiVoiceDock,
  usePiVoiceDocked,
  type PiVoiceEnd,
  type PiVoiceState,
} from "../lib/piVoiceSession.ts";
import { usePhoneSheetBack } from "../lib/sheetHistory.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";
import { VoiceOrb } from "./VoiceOrb.tsx";
import "./PiVoiceView.css";

const expand = () => setPiVoiceExpanded(true);
const collapse = () => setPiVoiceExpanded(false);

/**
 * The live voice call with a Pi pane. Like the agents app, its orb sits over the composer while
 * the chat stays in view and usable (PiVoiceDock); a drag up on the orb, or a tap, opens the
 * full-screen call, which follows the ChatGPT app's voice mode (one orb, what was said, Mute and
 * End within thumb reach), and a drag down puts it back. Mounted once in App, which shows the
 * full call, and the dock at the screen's foot when no composer of the call's pane is in view.
 */
export function PiVoiceView() {
  const voice = usePiVoice();
  const docked = usePiVoiceDocked();
  if (voice.status === "idle") return null;
  if (voice.expanded) return <PiVoiceDialog voice={voice} />;
  return docked ? null : <PiVoiceDock floating />;
}

/** The call's orb over the composer of its pane, while the call is not full-screen. */
export function PiVoiceDockHost({ paneId }: { paneId: string }) {
  const voice = usePiVoice();
  const shown = voice.status !== "idle" && !voice.expanded && voice.paneId === paneId;
  usePiVoiceDock(shown);
  return shown ? <PiVoiceDock /> : null;
}

function PiVoiceDock({ floating = false }: { floating?: boolean }) {
  const t = useT();
  const voice = usePiVoice();
  const surface = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  useOrbDrag(orb, surface, "up", expand);
  return (
    <div className={`pi-voice-dock${floating ? " is-floating" : ""}`} ref={surface} role="group" aria-label={t("Live voice")}>
      <span className="visually-hidden" aria-live="polite">{phaseText(voice, t)}</span>
      <button type="button" className="pi-voice-button is-compact" aria-pressed={voice.muted} aria-label={voice.muted ? t("Unmute") : t("Mute")}
        title={voice.muted ? t("Unmute") : t("Mute")} disabled={voice.status !== "live"} onClick={() => setPiVoiceMuted(!voice.muted)}>
        {voice.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </button>
      <button type="button" className={`pi-voice-dock-orb is-${voice.phase}`} ref={orb} aria-label={t("Open call")} title={t("Open call")} onClick={expand}>
        <VoiceOrb phase={voice.phase} levels={piVoiceLevels} />
      </button>
      {/* over a composer, its button hangs up; at the screen's foot there is none to */}
      {floating && (
        <button type="button" className="pi-voice-button is-compact is-end" aria-label={t("End call")} title={t("End call")} onClick={endPiVoice}>
          <PhoneOff aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function PiVoiceDialog({ voice }: { voice: PiVoiceState }) {
  const t = useT();
  const over = voice.status === "ended";
  const primary = useRef<HTMLButtonElement>(null);
  const surface = useFocusTrap<HTMLDivElement>(true, { initialFocus: primary });
  const stage = useRef<HTMLButtonElement>(null);
  useOrbDrag(stage, surface, "down", collapse);
  // the phone's Back puts the call back over the composer, as it closes any sheet
  usePhoneSheetBack(over ? dismissPiVoice : collapse);
  const status = over ? "" : phaseText(voice, t);
  return (
    <div className="pi-voice" role="dialog" aria-modal="true" aria-label={t("Live voice")} ref={surface} tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape") (over ? dismissPiVoice : collapse)(); }}>
      <header className="pi-voice-header">
        {!over && (
          <button type="button" className="pi-voice-collapse" aria-label={t("Minimize call")} title={t("Minimize call")} onClick={collapse}>
            <ChevronDown aria-hidden="true" />
          </button>
        )}
        <span className="pi-voice-label">{voice.label}</span>
        <span className="pi-voice-status" aria-live="polite">{status}</span>
      </header>
      {over ? (
        <div className="pi-voice-stage is-over">
          <VoiceOrb phase="ended" levels={piVoiceLevels} />
        </div>
      ) : (
        <button type="button" className={`pi-voice-stage is-${voice.phase}`} ref={stage} tabIndex={-1} aria-label={t("Minimize call")} onClick={collapse}>
          <VoiceOrb phase={voice.phase} levels={piVoiceLevels} />
        </button>
      )}
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
