import { useEffect, useRef, useState } from "react";
import type { AgentStatus } from "../../shared/protocol.ts";
import { ENDED_NOTIFICATION_BODY, paneNotificationTag, statusNotificationBody } from "../../shared/notify-policy.ts";
import { nativeAlerts, nativeAlertsState, requestNativeAlerts, showNativeAlert } from "./nativeApp.ts";

/**
 * Tab alerts: Web Notifications for pane status transitions while this page is open
 * but hidden. A device with a push subscription (lib/push.ts) gets the same alerts from
 * the server instead, and App skips these. Notification exists only in secure contexts
 * (https or localhost) - a plain-http LAN deployment reports "unsupported", and the bell
 * there switches only the in-app alerts.
 *
 * The transition policy is shared with the server (shared/notify-policy.ts).
 */

export { alertStatus, alertsAllow, shouldNotifyStatus } from "../../shared/notify-policy.ts";

export type NotificationState = "unsupported" | "default" | "granted" | "denied";

// the Android app answers asynchronously: its last answer, which App asks for on load (syncNotificationState)
let nativeState: NotificationState = "default";

export function notificationState(): NotificationState {
  if (nativeAlerts()) return nativeState;
  if (typeof globalThis.Notification === "undefined") return "unsupported";
  return globalThis.Notification.permission;
}

export async function syncNotificationState(): Promise<NotificationState> {
  if (nativeAlerts()) nativeState = await nativeAlertsState();
  return notificationState();
}

export async function requestNotificationPermission(): Promise<NotificationState> {
  if (nativeAlerts()) return nativeState = await requestNativeAlerts();
  if (typeof globalThis.Notification === "undefined") return "unsupported";
  const permission = await globalThis.Notification.requestPermission();
  return permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default";
}

/**
 * This browser's alert permission. The Android app's answer comes later than the first frame, and the
 * app asks once on load when alerts are on (they sync, or were on before a reinstall) and nobody asked yet.
 */
export function useNotificationState(alertsOn: boolean): [NotificationState, (state: NotificationState) => void] {
  const [state, setState] = useState<NotificationState>(() => notificationState());
  const asked = useRef(false);
  useEffect(() => { void syncNotificationState().then(setState); }, []);
  useEffect(() => {
    if (!alertsOn || state !== "default" || !nativeAlerts() || asked.current) return;
    asked.current = true;
    void requestNotificationPermission().then(setState);
  }, [alertsOn, state]);
  return [state, setState];
}

/**
 * The Android app shows it natively. Elsewhere, through the service worker when there is
 * one: Android Chrome has no `new Notification()`, and the worker's notificationclick
 * (public/sw.js) selects the pane. The constructor is the fallback for a page without a worker.
 */
async function show(paneId: string, title: string, body: string, onClick?: () => void, machineId = "local", workspaceId?: string): Promise<void> {
  if (nativeAlerts()) {
    // a tap comes back through nativeAlertTaps (lib/notificationTarget.ts), as a worker's would
    if (nativeState === "granted" && document.hidden) await showNativeAlert({ title, body, tag: paneNotificationTag(paneId, machineId), pane_id: paneId, machine_id: machineId, ...(workspaceId ? { workspace_id: workspaceId } : {}) }).catch(() => {});
    return;
  }
  if (typeof globalThis.Notification === "undefined") return;
  if (globalThis.Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && !document.hidden) return; // visible tab: the UI already shows it
  const options: NotificationOptions = { body, tag: paneNotificationTag(paneId, machineId), data: { pane_id: paneId, machine_id: machineId, ...(workspaceId ? { workspace_id: workspaceId } : {}) }, icon: "/icons/icon-192.png?v=sheep1" };
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration?.active) {
      await registration.showNotification(title, options);
      return;
    }
    const notification = new globalThis.Notification(title, options);
    notification.addEventListener("click", () => {
      window.focus();
      onClick?.();
    });
  } catch {
    /* no way to show it here: the sidebar badge still carries the change */
  }
}

/** `workspaceId`: the pane's workspace, as the server's push names it (server/push.ts), so a tap after the pane ends opens it. */
export function showPaneStatusNotification(paneId: string, title: string, status: AgentStatus, onClick?: () => void, machineId = "local", workspaceId?: string): void {
  void show(paneId, title, statusNotificationBody(status), onClick, machineId, workspaceId);
}

export function showPaneEndedNotification(paneId: string, title: string, onClick?: () => void, machineId = "local", workspaceId?: string): void {
  void show(paneId, title, ENDED_NOTIFICATION_BODY, onClick, machineId, workspaceId);
}
