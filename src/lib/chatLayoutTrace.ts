/** Temporary, opt-in geometry trace. Never reads message text, inputs, URLs or pane IDs. */
const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("trace-chat-layout") === "1";

type Flags = Partial<Record<"following" | "manual" | "selecting" | "working" | "streaming" | "revealing" | "workBlockLive" | "answerOnlyLive" | "reserved" | "reader" | "up" | "shrunkAbove" | "shrunk" | "leftEnd" | "turns" | "liveParts", boolean | number>>;
type Reason = "commit" | "scroll" | "frame" | "resize" | "mutation";
const events: object[] = [];
const flags = new WeakMap<HTMLElement, Flags>();
const cleanups = new Set<() => void>();
let began = 0, timer = 0, lossTimer = 0, finished = false;

function download(): void {
  if (finished || events.length === 0) return;
  finished = true;
  clearTimeout(timer); clearTimeout(lossTimer);
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
  const blob = new Blob([JSON.stringify({ version: 1, events }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url;
  link.download = `ovis-chat-layout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function traceChatLayout(node: HTMLElement | null, reason: Reason, next: Flags = {}): void {
  if (!enabled || finished || node === null || !node.isConnected || node.getBoundingClientRect().height === 0) return;
  if (began === 0) {
    began = performance.now();
    timer = window.setTimeout(download, 90_000);
  }
  const previous = flags.get(node) ?? {}, current = { ...previous, ...next };
  flags.set(node, current);
  const rect = (element: Element | null) => {
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  };
  const rows = node.querySelectorAll("[data-chat-row]");
  const transcript = node.querySelector<HTMLElement>(".chat-transcript");
  events.push({
    ms: Math.round(performance.now() - began), reason, ...current,
    viewport: { width: innerWidth, height: innerHeight, scale: window.visualViewport?.scale ?? 1 },
    top: node.scrollTop, height: node.scrollHeight, client: node.clientHeight,
    gap: node.scrollHeight - node.clientHeight - node.scrollTop,
    view: rect(node), composer: rect(node.closest(".terminal-stack")?.querySelector(".composer") ?? null),
    rows: rows.length, lastRow: rect(rows.item(rows.length - 1)),
    footer: rect(node.querySelector(".chat-virtual-footer")),
    head: rect(node.querySelector(".work-block.is-live .work-block-head")),
    footerHeads: node.querySelectorAll(".chat-virtual-footer .chat-activity").length,
    reservedHeads: node.querySelectorAll(".chat-activity-reserved").length,
    jump: Boolean(node.closest(".chat-frame")?.querySelector(".chat-new-messages")),
    padding: transcript === null ? 0 : parseFloat(getComputedStyle(transcript).paddingBottom),
    temporaryPadding: transcript === null ? 0 : parseFloat(transcript.style.paddingBottom) || 0,
  });
  if (events.length > 1200) events.shift();
  // Keep the aftermath too. No export or focus change happens during the first tool transition.
  if (reason === "scroll" && previous.following === true && current.following === false && lossTimer === 0) lossTimer = window.setTimeout(download, 4000);
}

export function watchChatLayout(node: HTMLElement | null): (() => void) | undefined {
  if (!enabled || finished || node === null) return;
  let frame = 0;
  const schedule = (reason: Reason) => {
    traceChatLayout(node, reason);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      traceChatLayout(node, "frame");
      frame = requestAnimationFrame(() => traceChatLayout(node, "frame"));
    });
  };
  const mutations = new MutationObserver(() => schedule("mutation"));
  mutations.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "aria-expanded"] });
  const resized = new ResizeObserver(() => schedule("resize"));
  resized.observe(node);
  const composer = node.closest(".terminal-stack")?.querySelector(".composer");
  if (composer) resized.observe(composer);
  const stop = () => { mutations.disconnect(); resized.disconnect(); cancelAnimationFrame(frame); cleanups.delete(stop); };
  cleanups.add(stop);
  return stop;
}
