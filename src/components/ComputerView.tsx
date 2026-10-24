import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { t } from "../lib/i18n.ts";
import { NO_STICKY_MODIFIERS, type StickyModifiers } from "../lib/keys.ts";
import type { KeyBarKeyItem } from "../lib/keyBar.ts";
import { useMediaQuery } from "../lib/useMediaQuery.ts";
import { useSettings } from "../lib/settings.ts";
import { KeyBar } from "./KeyBar.tsx";
import "./ComputerView.css";

type Screen = { path: string } | { error: string } | null;

// The keyboard field always holds these, so Gboard's ⌫ has something to delete when nothing is typed yet.
const PAD = "        ";
// keys a hardware keyboard presses in the field that type nothing there
const KEYS = new Set(["Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Delete", "Insert",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]);

/**
 * The Computer view: the PC's desktop, live, over the pane's Chat or Terminal, which stay connected
 * under it. The server opens screen-here's bridge to that PC (server/screen.ts) and passes on its
 * viewer, which carries the desktop, its sound and a login when the PC asks for one. On a touch
 * screen the viewer works as a trackpad, and the Terminal's key bar and the phone's keyboard type
 * into the desktop through it. `hidden` keeps it connected out of sight.
 */
export function ComputerView({ machineId, machineName, hidden }: { machineId: string; machineName: string; hidden: boolean }) {
  const [screen, setScreen] = useState<Screen>(null);
  const [full, setFull] = useState(false);
  const [typing, setTyping] = useState(false);
  const [modifiers, setModifiers] = useState<StickyModifiers>(NO_STICKY_MODIFIERS);
  const modifiersRef = useRef(modifiers);
  modifiersRef.current = modifiers;
  const viewRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const typedRef = useRef(PAD);
  const composingRef = useRef(false);
  const coarse = useMediaQuery("(pointer: coarse)");
  const { settings } = useSettings();

  useEffect(() => {
    let live = true;
    setScreen(null);
    void fetch("/api/screen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ machine_id: machineId }), credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { path?: string; error?: { message?: string } } | null;
        if (!live) return;
        setScreen(response.ok && body?.path ? { path: body.path } : { error: body?.error?.message ?? t("This PC's desktop can't be shown.") });
      })
      .catch(() => { if (live) setScreen({ error: t("This PC's desktop can't be shown.") }); });
    return () => { live = false; };
  }, [machineId]);

  const post = useCallback((message: object) => frameRef.current?.contentWindow?.postMessage(message, location.origin), []);
  /** One key to the desktop, with the held modifiers, which a key without its own chord then lets go of. */
  const send = useCallback((key: string, own?: StickyModifiers) => {
    post({ screen: "key", key, modifiers: own ?? modifiersRef.current });
    if (own === undefined && (modifiersRef.current.ctrl || modifiersRef.current.alt || modifiersRef.current.shift)) setModifiers(NO_STICKY_MODIFIERS);
  }, [post]);

  useEffect(() => {
    post({ screen: "shown", shown: !hidden });
    if (!hidden) return;
    fieldRef.current?.blur();
    setFull(false);
  }, [hidden, post]);

  // Full screen: the view covers the page, and the browser's own full screen hides the phone's bars where it may
  useEffect(() => {
    const view = viewRef.current;
    if (full) void view?.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    const left = (): void => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", left);
    return () => document.removeEventListener("fullscreenchange", left);
  }, [full]);

  // Sends what the keyboard changed in the field: ⌫ for each character it took back, then what it added.
  const typed = (event: FormEvent<HTMLTextAreaElement>): void => {
    const field = event.currentTarget;
    const before = [...typedRef.current];
    const after = [...field.value];
    let same = 0;
    while (same < before.length && same < after.length && before[same] === after[same]) same++;
    for (let index = same; index < before.length; index++) send("Backspace");
    for (const character of after.slice(same)) send(character === "\n" ? "Enter" : character);
    typedRef.current = field.value;
    if (!composingRef.current) refill(field);
  };
  // Back to just the padding once the padding is eaten into or a line is done, while no word is being composed
  const refill = (field: HTMLTextAreaElement): void => {
    if (field.value.startsWith(PAD) && !field.value.includes("\n") && field.value.length < 64) return;
    field.value = PAD;
    typedRef.current = PAD;
  };
  const pressed = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (composingRef.current || !KEYS.has(event.key)) return;
    event.preventDefault();
    send(event.key);
  };

  if (screen === null || "error" in screen) {
    return <div className={`computer-view is-message${hidden ? " is-hidden" : ""}`} role={screen ? "alert" : undefined}>{screen?.error ?? t("Connecting…")}</div>;
  }
  return (
    <div ref={viewRef} className={`computer-view${full ? " is-full" : ""}${hidden ? " is-hidden" : ""}`}>
      <div className="computer-view-desktop">
        <iframe ref={frameRef} src={screen.path} title={t("{name}'s desktop", { name: machineName })} allow="autoplay; clipboard-read; clipboard-write"
          onLoad={() => post({ screen: "shown", shown: !hidden })} />
        <button type="button" className="computer-view-full" aria-label={t(full ? "Exit full screen" : "Full screen")} title={t(full ? "Exit full screen" : "Full screen")}
          onClick={() => setFull((value) => !value)}>
          {full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </button>
      </div>
      {coarse && <>
        <textarea ref={fieldRef} className="computer-view-field" defaultValue={PAD} aria-label={t("Type on {name}", { name: machineName })}
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="enter"
          onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onInput={typed} onKeyDown={pressed}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(event) => { composingRef.current = false; refill(event.currentTarget); }} />
        <KeyBar items={settings.keyBarItems} modifiers={modifiers}
          onToggleModifier={(modifier) => setModifiers((held) => ({ ...held, [modifier]: !held[modifier] }))}
          onKey={(item: KeyBarKeyItem) => send(item.key, item.modifiers)}
          directTyping={!typing} directLabel={t("Keyboard")}
          onToggleDirect={() => { if (typing) fieldRef.current?.blur(); else fieldRef.current?.focus(); }} />
      </>}
    </div>
  );
}
