import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { LOCAL_MACHINE } from "../../shared/machines.ts";
import { encodePiVoiceFrame, parsePiFrame, PI_VOICE_PATH, type PhoneToPiFrame, type PiToPhoneFrame, type PiVoice, type PiVoiceEndCode, type PiVoicePhase } from "../../shared/pi-voice.ts";
import { fetchPiVoiceStatus } from "./api.ts";
import { t } from "./i18n.ts";
import { useMachineId } from "./machineContext.tsx";
import { nativeLiveCall, nativeLiveCallMuted, onNativeLiveCallAction } from "./nativeApp.ts";
import { BrowserLiveMedia, browserTimers } from "./piVoiceMedia.ts";
import { micErrorReason } from "./voice.ts";
import { playVoiceChime, primeVoiceChime } from "./voiceChime.ts";

/**
 * The live voice call with the Pi in a pane, one per tab, kept outside React so the composer
 * remounting (a pane switch, a layout change) does not end it. The phone is the call's
 * microphone and speaker (piVoiceMedia.ts); this server relays Pi's frames (server/pi-voice.ts).
 * A call is first started by a tap: the browser asks for the microphone and lets the reply play
 * on the strength of that gesture, so `startPiVoice` does its browser calls before it waits for
 * anything. From then on the call follows the selected agent (`followPiVoice`): those calls start
 * without a tap, on the page's sticky activation, until End.
 */

/** why a call is over, when it did not end by a tap on End or by Pi's own account of a normal end */
export type PiVoiceEnd =
  | { kind: PiVoiceEndCode }
  | { kind: "denied" | "no_mic" | "unsupported" | "failed" }
  /** Pi's own words: why it could not start or keep the call */
  | { kind: "error"; message: string };

export interface PiVoiceState {
  /**
   * `idle`: no call, nothing followed; `starting`: reaching Pi; `live`: the call is on; `away`: the
   * call follows the selected agent but has none, with `end` saying why (null: no voice there)
   */
  status: "idle" | "starting" | "live" | "away";
  /** the PC the pane is on (shared/machines.ts) */
  machineId: string;
  paneId: string;
  label: string;
  phase: PiVoicePhase;
  muted: boolean;
  assistantText: string;
  end: PiVoiceEnd | null;
}

const IDLE: PiVoiceState = { status: "idle", machineId: LOCAL_MACHINE, paneId: "", label: "", phase: "connecting", muted: false, assistantText: "", end: null };

/**
 * How long the microphone stays open once a call ends: the close chime's length. Letting go of it
 * turns the phone's sound back from a call's, which would cut the chime off.
 */
const RELEASE_AFTER_MS = 500;

interface Call {
  /** opened only once the microphone is allowed (see `connect`) */
  socket: WebSocket | null;
  media: BrowserLiveMedia | null;
  stream: MediaStream | null;
  audio: HTMLAudioElement;
  audioContext: AudioContext | null;
  wakeLock: WakeLockSentinel | null;
  /** the browser lets go of the wake lock when the page is hidden: it asks again when it is back */
  keepAwake: () => void;
  /** the tap on End: the socket closing after it is not a loss */
  userEnded: boolean;
}

/**
 * Pi reads the reply's level to tell speaking from listening, and speech has gaps between words:
 * left alone the label would flicker once a word. Going back to listening waits this long.
 */
const SPEAKING_HOLD_MS = 600;

let state: PiVoiceState = IDLE;
let call: Call | null = null;
let settling: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function update(patch: Partial<PiVoiceState>): void {
  state = { ...state, ...patch };
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

function send(frame: PhoneToPiFrame): void {
  if (call?.socket?.readyState === WebSocket.OPEN) call.socket.send(encodePiVoiceFrame(frame));
}

function callUrl(machineId: string, paneId: string, voice: PiVoice | undefined): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const chosen = voice ? `&voice=${voice}` : "";
  const machine = machineId === LOCAL_MACHINE ? "" : `&machine_id=${encodeURIComponent(machineId)}`;
  return `${protocol}//${window.location.host}${PI_VOICE_PATH}?pane_id=${encodeURIComponent(paneId)}${machine}${chosen}`;
}

/**
 * Releases the microphone, the speaker, the screen and the socket, and shows how the call ended
 * (null: it simply did). `away` keeps following the selected agent; `idle` stops.
 */
function finish(end: PiVoiceEnd | null, next: "idle" | "away" = "away"): void {
  const over = call;
  call = null;
  clearTimeout(settling);
  if (over) {
    playVoiceChime("close");
    // both sides go quiet at once; the microphone itself is let go once the chime has played
    over.audio.pause();
    for (const track of over.stream?.getTracks() ?? []) track.enabled = false;
    document.removeEventListener("visibilitychange", over.keepAwake);
    void over.wakeLock?.release().catch(() => undefined);
    over.socket?.close();
    setTimeout(() => {
      over.media?.close();
      // a call that never got as far as its media still holds what the tap asked for
      for (const track of over.stream?.getTracks() ?? []) track.stop();
      void over.audioContext?.close().catch(() => undefined);
      if (over.stream) nativeLiveCall(null);
    }, RELEASE_AFTER_MS);
  }
  update(next === "idle" ? { ...IDLE } : { ...IDLE, status: "away", machineId: state.machineId, paneId: state.paneId, end });
}

function showPhase(phase: PiVoicePhase): void {
  clearTimeout(settling);
  if (phase === "listening" && state.phase === "speaking") {
    settling = setTimeout(() => update({ phase }), SPEAKING_HOLD_MS);
    return;
  }
  if (phase === "connecting" || state.status !== "starting") {
    update({ phase });
    return;
  }
  // ready to talk, on the opening chime. The phone's sound is a call's by now, so the chime is not
  // cut off switching to it
  playVoiceChime("open");
  update({ phase, status: "live" });
}

function onFrame(frame: PiToPhoneFrame): void {
  call?.media?.receive(frame);
  switch (frame.type) {
    case "phase":
      showPhase(frame.phase);
      break;
    case "mute":
      update({ muted: frame.muted });
      nativeLiveCallMuted(frame.muted);
      break;
    case "transcript":
      // only the reply shows; what was said to it is in the chat once the call ends
      if (frame.role === "assistant") update({ assistantText: frame.text });
      break;
    case "transcript-clear":
      update({ assistantText: "" });
      break;
    case "ended":
      // Pi ending the call on its own account (/live in its terminal) is an End; anything else keeps following
      if (frame.error) finish({ kind: "error", message: frame.error });
      else if (frame.code) finish({ kind: frame.code });
      else finish(null, "idle");
      break;
    default:
      break;
  }
}

/**
 * Opens the connection to Pi, now that the microphone is allowed, and listens to it from its
 * first frame. Opening it any earlier would leave a prompt that stays open for a minute with
 * nobody listening to Pi giving up on the call.
 */
function connect(active: Call, machineId: string, paneId: string, voice: PiVoice | undefined): void {
  const { stream, audio, audioContext } = active;
  if (!stream) return;
  const socket = new WebSocket(callUrl(machineId, paneId, voice));
  active.socket = socket;
  const media = new BrowserLiveMedia({
    stream,
    audio,
    audioContext,
    createPeer: () => new RTCPeerConnection(),
    send,
    // a call that has ended still holds its media for a moment: its failing then is not this call's
    onFailed: () => {
      if (call === active) finish({ kind: "failed" });
    },
  });
  active.media = media;
  socket.onopen = () => media.hello();
  socket.onmessage = (event) => {
    if (call !== active || typeof event.data !== "string") return;
    let frame;
    try {
      frame = parsePiFrame(event.data);
    } catch {
      finish({ kind: "closed" });
      return;
    }
    if (frame.type !== "ready") onFrame(frame);
  };
  socket.onclose = () => {
    if (call === active && !active.userEnded) finish({ kind: "closed" });
  };
}

interface CallTarget { machineId: string; paneId: string; label: string; voice?: PiVoice }

/**
 * Starts a call with the Pi in `paneId` on `machineId`, in `voice` if given and otherwise the one
 * Pi is set to. The first one must run inside the tap's own handler: the microphone is asked for,
 * the speaker element and the audio context are made, and the screen kept awake, all before
 * anything is waited for.
 */
export function startPiVoice(target: CallTarget): void {
  if (state.status === "starting" || state.status === "live") return;
  open(target);
}

function open({ machineId, paneId, label, voice }: CallTarget): void {
  update({ ...IDLE, status: "starting", machineId, paneId, label });
  // the opening chime plays once the call is ready to talk; only a tap lets sound start
  primeVoiceChime();
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!getUserMedia || typeof RTCPeerConnection === "undefined") {
    finish({ kind: "unsupported" });
    return;
  }
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioContext = AudioContextClass ? new AudioContextClass() : null;
  void audioContext?.resume().catch(() => undefined);
  const audio = new Audio();
  audio.autoplay = true;
  void audio.play().catch(() => undefined);
  const started: Call = { socket: null, media: null, stream: null, audio, audioContext, wakeLock: null, keepAwake: () => {}, userEnded: false };
  call = started;
  started.keepAwake = () => {
    if (call !== started || document.visibilityState !== "visible" || (started.wakeLock && !started.wakeLock.released)) return;
    void navigator.wakeLock?.request("screen").then((lock) => {
      if (call === started) started.wakeLock = lock;
      else void lock.release().catch(() => undefined);
    }, () => undefined);
  };
  started.keepAwake();
  document.addEventListener("visibilitychange", started.keepAwake);
  getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).then(
    (stream) => {
      if (call !== started) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      started.stream = stream;
      onNativeLiveCallAction((action) => action === "hangup" ? endPiVoice() : setPiVoiceMuted(!state.muted));
      nativeLiveCall({ title: t("Live voice"), body: label, mute: t("Mute"), unmute: t("Unmute") });
      connect(started, machineId, paneId, voice);
    },
    (error: unknown) => {
      // a refusal reads as one, a missing or busy microphone as that, as dictation tells them apart
      const reason = error instanceof DOMException ? micErrorReason(error.name) : "no_mic";
      if (call === started) finish({ kind: reason === "permission" ? "denied" : "no_mic" });
    },
  );
}

/** Ends the call that is on, telling Pi so it can end its side, into `next`. */
function hangUp(next: "idle" | "away"): void {
  if (!call) {
    update(next === "idle" ? { ...IDLE } : { end: null });
    return;
  }
  call.userEnded = true;
  send({ type: "stop" });
  finish(null, next);
}

/** The tap on End: stops at once, and stops following the selected agent. */
export function endPiVoice(): void {
  hangUp("idle");
}

/** A pane's agent, as the call follows the selection. */
export interface PiVoiceFollowTarget {
  machineId: string;
  paneId: string | null;
  agent: string | null;
  label: string;
  voice?: PiVoice;
}

/**
 * How long a selection holds before the call follows it: moving through several agents opens no
 * call on each, and the call left behind has let go of its microphone by then.
 */
export const FOLLOW_SETTLE_MS = 1000;

/**
 * The selection moved to `target`: a call on another agent ends at once, and once `target` has
 * held for FOLLOW_SETTLE_MS a call starts there if its Pi can take one. Nothing while no call is
 * followed. Returns the cancel for a selection that moves on before then.
 */
export function followPiVoice(
  target: PiVoiceFollowTarget,
  deps: { after?: (run: () => void, ms: number) => () => void; status?: typeof fetchPiVoiceStatus } = {},
): () => void {
  if (state.status === "idle") return () => {};
  const here = state.machineId === target.machineId && state.paneId === target.paneId;
  if (here && state.status !== "away") return () => {};
  // a microphone refused, or a browser without calls, would only fail again on the next agent
  const stuck = state.end?.kind === "denied" || state.end?.kind === "unsupported";
  if (!here && call) hangUp("away");
  update({ machineId: target.machineId, paneId: target.paneId ?? "", label: target.label, end: here || stuck ? state.end : null });
  const { paneId } = target;
  if (paneId === null || target.agent !== "pi" || stuck) return () => {};
  let live = true;
  const { after = browserTimers.after, status = fetchPiVoiceStatus } = deps;
  const cancel = after(() => {
    void status(paneId, target.machineId).then(
      (answer) => {
        if (!live || state.status !== "away") return;
        if (answer.busy) update({ end: { kind: "busy" } });
        else if (answer.available) open({ machineId: target.machineId, paneId, label: target.label, ...(target.voice ? { voice: target.voice } : {}) });
      },
      () => undefined,
    );
  }, FOLLOW_SETTLE_MS);
  return () => {
    live = false;
    cancel();
  };
}

/** Keeps a followed call on the selected agent (see `followPiVoice`). */
export function usePiVoiceFollow(target: PiVoiceFollowTarget): void {
  const latest = useRef(target);
  latest.current = target;
  const { machineId, paneId, agent } = target;
  // the call's state is no dependency: a call started from a composer outside the selection stays on
  useEffect(() => followPiVoice(latest.current), [machineId, paneId, agent]);
}

/** What a call with the Pi in `cwd` is named: the folder's name. */
export function piVoiceLabel(cwd: string | null | undefined): string {
  return cwd?.split("/").filter(Boolean).at(-1) ?? "Pi";
}

/** Asks Pi to mute or unmute; the answer comes back as a `mute` frame, which is what the view shows. */
export function setPiVoiceMuted(muted: boolean): void {
  send({ type: "set-muted", muted });
}

/** Linear 0..1 levels of the microphone and the reply, read each frame by the orb. */
export function piVoiceLevels(): { input: number; output: number } {
  return call?.media?.sample() ?? { input: 0, output: 0 };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function piVoiceState(): PiVoiceState {
  return state;
}

export function usePiVoice(): PiVoiceState {
  return useSyncExternalStore(subscribe, piVoiceState);
}

/** Pi can take a call in this pane: it is Pi's and its bridge answers, on whichever PC it runs (not before a reload of a Pi that started without it). */
export function usePiVoiceAvailable(paneId: string | null, agent: string | null | undefined): boolean {
  const machineId = useMachineId();
  const status = usePiVoice().status;
  const idle = status === "idle" || status === "away";
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (paneId === null || agent !== "pi" || !idle) {
      setAvailable(false);
      return;
    }
    let live = true;
    const ask = () => {
      void fetchPiVoiceStatus(paneId, machineId).then(
        (status) => { if (live) setAvailable(status.available); },
        () => { if (live) setAvailable(false); },
      );
    };
    ask();
    // a Pi reloaded after the pane was opened gains the bridge without the pane changing
    const timer = setInterval(ask, 30_000);
    document.addEventListener("visibilitychange", ask);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [paneId, agent, machineId, idle]);
  return available;
}
