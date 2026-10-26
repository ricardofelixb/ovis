import { ChevronDown, Mic, MicOff, PhoneOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

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
  const floating = voice.status === "live" && !voice.expanded && !docked;
  const leaving = useDockExit(floating, voice);
  if ((voice.status === "live" || voice.status === "ended") && voice.expanded) return <PiVoiceDialog voice={voice} />;
  if (floating) return <PiVoiceDock voice={voice} floating />;
  return leaving ? <PiVoiceDock voice={leaving} floating leaving /> : null;
}

/** The call's orb over the composer of its pane, while the call is not full-screen. */
export function PiVoiceDockHost({ paneId }: { paneId: string }) {
  const voice = usePiVoice();
  // only once the call is ready to talk, as in the agents app: while it connects, the composer's button shows it
  const shown = voice.status === "live" && !voice.expanded && voice.paneId === paneId;
  const leaving = useDockExit(shown, voice);
  usePiVoiceDock(shown || leaving !== null);
  if (shown) return <PiVoiceDock voice={voice} />;
  return leaving ? <PiVoiceDock voice={leaving} leaving /> : null;
}

/** How long the orb takes to shrink away once its call ends: the agents app's exit wait. */
const DOCK_EXIT_MS = 280;

/** A dock showing this soon after its call became ready is the call opening. */
const ENTER_WINDOW_MS = 400;

/**
 * The call as the dock last showed it, for the moment its orb shrinks away once the call ends.
 * Opening the full call or moving to another pane is no ending: the dock goes at once.
 */
function useDockExit(shown: boolean, voice: PiVoiceState): PiVoiceState | null {
  const last = useRef<PiVoiceState | null>(null);
  const [leaving, setLeaving] = useState<PiVoiceState | null>(null);
  useLayoutEffect(() => {
    if (shown) last.current = voice;
  });
  useLayoutEffect(() => {
    if (shown) {
      setLeaving(null);
      return;
    }
    const was = last.current;
    last.current = null;
    if (!was || voice.status !== "idle") return;
    setLeaving(was);
    const timer = setTimeout(() => setLeaving(null), DOCK_EXIT_MS);
    return () => clearTimeout(timer);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  return leaving;
}

function PiVoiceDock({ voice, floating = false, leaving = false }: { voice: PiVoiceState; floating?: boolean; leaving?: boolean }) {
  const t = useT();
  // a call opens on the orb growing in; putting the full call back is no opening
  const [entering] = useState(() => Date.now() - voice.readyAt < ENTER_WINDOW_MS);
  const surface = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  useOrbDrag(orb, surface, "up", expand);
  const classes = ["pi-voice-dock", floating && "is-floating", entering && "is-entering", leaving && "is-leaving"].filter(Boolean).join(" ");
  return (
    <div className={classes} ref={surface} role="group" aria-label={t("Live voice")} aria-hidden={leaving || undefined}>
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
  const transcript = useRef<HTMLDivElement>(null);
  // the newest words stay in view while the reply grows, unless a finger scrolled back to read
  const following = useRef(true);
  useLayoutEffect(() => {
    const box = transcript.current;
    if (voice.assistantText === "") following.current = true;
    if (box && following.current) box.scrollTop = box.scrollHeight;
  }, [voice.assistantText]);
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
          <div className="pi-voice-transcript" ref={transcript} aria-live="polite" onScroll={(event) => {
            const box = event.currentTarget;
            following.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
          }}>
            {voice.assistantText !== "" && <p className="pi-voice-line"><span className="visually-hidden">{t("Pi said")}: </span>{voice.assistantText}</p>}
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
