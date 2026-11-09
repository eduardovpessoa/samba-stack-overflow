import type { Session } from "../api";

/**
 * Talk reminders as local notifications.
 *
 * What this is: the page schedules a notification ten minutes before each
 * talk in the setlist, and the service worker shows it. It works while the
 * app is open or was recently in the background.
 *
 * What this is not: push. Nothing is sent from a server, so a phone that has
 * fully closed the app will not be woken up. That would need a push service
 * and is deliberately not built here. The UI says so.
 */

export const REMINDER_LEAD_MINUTES = 10;

// Browsers clamp or drop very long timers, so only talks starting within
// this window are scheduled; the rest are picked up on the next visit.
const MAX_AHEAD_MS = 12 * 60 * 60 * 1000;

export type ReminderSupport = "ready" | "ask" | "blocked" | "unsupported";

export function reminderSupport(): ReminderSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "ready";
  if (Notification.permission === "denied") return "blocked";
  return "ask";
}

/** Ask for permission. Must be called from a click, never on page load. */
export async function askForReminders(): Promise<ReminderSupport> {
  if (reminderSupport() === "unsupported") return "unsupported";
  try {
    await Notification.requestPermission();
  } catch {
    // Older Safari only supports the callback form; the state below still tells the truth.
  }
  return reminderSupport();
}

async function show(title: string, body: string, tag: string): Promise<boolean> {
  if (reminderSupport() !== "ready") return false;
  const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    // Installed apps and Android need the service worker to show it.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

function describe(session: Session, timeZone: string): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(session.start),
  );
  return `${time} · ${session.room}`;
}

/** A reminder right now, so people can see what one looks like before trusting it. */
export function sendTestReminder(session: Session, timeZone: string): Promise<boolean> {
  return show(`Coming up: ${session.title}`, `${describe(session, timeZone)} · this is a test reminder`, "samba-test");
}

/**
 * Schedule a reminder for each talk that starts soon. Returns a function that
 * cancels them; call it whenever the setlist changes, then schedule again.
 */
export function scheduleReminders(sessions: Session[], timeZone: string): () => void {
  if (reminderSupport() !== "ready") return () => {};
  const timers: number[] = [];
  const now = Date.now();
  for (const session of sessions) {
    const fireAt = Date.parse(session.start) - REMINDER_LEAD_MINUTES * 60 * 1000;
    const wait = fireAt - now;
    if (wait <= 0 || wait > MAX_AHEAD_MS) continue;
    timers.push(
      window.setTimeout(() => {
        void show(
          `In ${REMINDER_LEAD_MINUTES} minutes: ${session.title}`,
          describe(session, timeZone),
          `samba-${session.id}`,
        );
      }, wait),
    );
  }
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
