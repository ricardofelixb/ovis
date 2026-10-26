/**
 * The iOS app (app/) opens this client as its WebView's first page and puts Capacitor's bridge
 * on it. Only what the client needs of the app is here, through `window.Capacitor` as the app
 * injects it, so the browser build carries no Capacitor code.
 */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>;
  nativeCallback?: (plugin: string, method: string, options: Record<string, unknown>, callback: (data: unknown) => void) => string;
}

function bridge(): CapacitorBridge | undefined {
  return (globalThis as { Capacitor?: CapacitorBridge }).Capacitor;
}

/** Whether this page runs inside the iOS app rather than a browser. */
export function inNativeApp(): boolean {
  return bridge()?.isNativePlatform?.() === true;
}

/** Back to the app's list of PCs (app/ios/App/App/HerdrShellPlugin.swift, `disconnect`). */
export async function changePc(): Promise<void> {
  await bridge()?.nativePromise?.("HerdrShell", "disconnect", {});
}

const inAndroidApp = (): boolean => inNativeApp() && bridge()?.getPlatform?.() === "android";

/** The Android app shows alerts itself (HerdrShellPlugin.java): its WebView has no Web Notifications. */
export function nativeAlerts(): boolean {
  return inAndroidApp();
}

/**
 * Android stops a hidden app's microphone: the Android app keeps a live call going out of sight
 * under an ongoing notification (LiveCallService.java). An app without it stays as it was.
 */
export function nativeLiveCall(notice: { title: string; body: string; mute: string; unmute: string } | null): void {
  if (!inAndroidApp()) return;
  const answer = bridge()?.nativePromise?.("HerdrShell", notice ? "liveCallStarted" : "liveCallEnded", notice ?? {});
  void answer?.catch(() => undefined);
}

/** The call's notification shows Mute or Unmute as the call is. */
export function nativeLiveCallMuted(muted: boolean): void {
  if (!inAndroidApp()) return;
  void bridge()?.nativePromise?.("HerdrShell", "liveCallMuted", { muted })?.catch(() => undefined);
}

let liveCallActions = false;

/** Hang up or Mute tapped on the call's notification, the lock screen's included. Listens once. */
export function onNativeLiveCallAction(act: (action: "hangup" | "mute") => void): void {
  const callback = bridge()?.nativeCallback;
  if (liveCallActions || !inAndroidApp() || !callback) return;
  liveCallActions = true;
  callback("HerdrShell", "addListener", { eventName: "liveCallAction" }, (data) => {
    const action = (data as { action?: string } | undefined)?.action;
    if (action === "hangup" || action === "mute") act(action);
  });
}

export type NativeAlertsState = "granted" | "denied" | "default";

async function alertsCall(method: "alertsState" | "requestAlerts"): Promise<NativeAlertsState> {
  const answer = await bridge()?.nativePromise?.("HerdrShell", method, {}) as { state?: string } | undefined;
  return answer?.state === "granted" ? "granted" : answer?.state === "denied" ? "denied" : "default";
}

export const nativeAlertsState = (): Promise<NativeAlertsState> => alertsCall("alertsState");
export const requestNativeAlerts = (): Promise<NativeAlertsState> => alertsCall("requestAlerts");

export interface NativeAlert { title: string; body: string; tag: string; pane_id: string; machine_id: string; workspace_id?: string }

export async function showNativeAlert(alert: NativeAlert): Promise<void> {
  await bridge()?.nativePromise?.("HerdrShell", "alert", { ...alert });
}

/** A tapped native alert as public/sw.js posts a tapped notification: a `select-pane` message (lib/notificationTarget.ts). */
export function nativeAlertTaps(): { addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void } | undefined {
  const callback = bridge()?.nativeCallback;
  if (!nativeAlerts() || !callback) return undefined;
  return {
    addEventListener: (_type, listener) => {
      callback("HerdrShell", "addListener", { eventName: "alertTap" }, (data) => {
        listener(new MessageEvent("message", { data: { ...(data as object), type: "select-pane", view: "chat" } }));
      });
    },
  };
}
