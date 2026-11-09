import { useEffect, useState } from "react";

import type { Session } from "../api";
import {
  REMINDER_LEAD_MINUTES,
  askForReminders,
  reminderSupport,
  scheduleReminders,
  sendTestReminder,
  type ReminderSupport,
} from "../lib/reminders";

type Props = { items: Session[]; timeZone: string };

/**
 * Talk reminders for the setlist. Permission is only ever asked from a click,
 * and the copy says plainly what these are: local reminders, not push.
 */
export function Reminders({ items, timeZone }: Props) {
  const [support, setSupport] = useState<ReminderSupport>(() => reminderSupport());
  const [note, setNote] = useState("");

  // Schedule again whenever the setlist changes, and cancel what was pending.
  useEffect(() => {
    if (support !== "ready") return;
    return scheduleReminders(items, timeZone);
  }, [items, timeZone, support]);

  if (items.length === 0 || support === "unsupported") return null;

  const enable = async () => {
    const result = await askForReminders();
    setSupport(result);
    setNote(result === "ready" ? "Reminders are on." : result === "blocked" ? "Reminders were not allowed." : "");
  };

  const test = async () => {
    const first = items[0];
    if (!first) return;
    const shown = await sendTestReminder(first, timeZone);
    setNote(shown ? "Test reminder sent. Check your notifications." : "The browser did not show the reminder.");
  };

  return (
    <div className="reminders">
      <p className="reminders__title">Reminders</p>
      {support === "ask" && (
        <>
          <p className="reminders__text">
            Get a nudge {REMINDER_LEAD_MINUTES} minutes before each talk in your setlist. It works while this app is
            open or recently in the background. It is not a push service.
          </p>
          <button type="button" className="btn btn--small" onClick={enable}>
            Turn on reminders
          </button>
        </>
      )}
      {support === "blocked" && (
        <p className="reminders__text">
          Notifications are blocked for this site. Allow them in your browser settings to get reminders.
        </p>
      )}
      {support === "ready" && (
        <>
          <p className="reminders__text">
            On: a nudge {REMINDER_LEAD_MINUTES} minutes before each talk, while this app is open or recently in the
            background.
          </p>
          <button type="button" className="btn btn--small" onClick={test}>
            Send a test reminder
          </button>
        </>
      )}
      <p className="reminders__note" role="status" aria-live="polite">
        {note}
      </p>
    </div>
  );
}
