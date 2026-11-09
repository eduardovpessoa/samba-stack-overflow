// Date and label formatting. The conference timezone always comes from
// /api/meta: the browser's own timezone is never used for session times.

import type { A11yKey, Engine, SearchMode, Tri } from "../api";

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = timeFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone });
    timeFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** "10:00 AM" in the conference timezone. */
export function formatTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time not published";
  return timeFormatter(timeZone).format(date);
}

/** "10:00 – 10:35 AM" in the conference timezone. */
export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Time not published";
  try {
    return timeFormatter(timeZone).formatRange(start, end);
  } catch {
    return `${timeFormatter(timeZone).format(start)} – ${timeFormatter(timeZone).format(end)}`;
  }
}

// A day key is already a calendar date in the conference timezone, so it is
// formatted at UTC noon to keep the browser's timezone from shifting it.
function dayDate(dayKey: string): Date | null {
  const date = new Date(`${dayKey}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dayShort = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const weekdayOnly = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

/** "Tue, Nov 10" */
export function formatDay(dayKey: string): string {
  const date = dayDate(dayKey);
  return date ? dayShort.format(date) : dayKey;
}

/** "Tuesday, November 10" */
export function formatDayLong(dayKey: string): string {
  const date = dayDate(dayKey);
  return date ? dayLong.format(date) : dayKey;
}

/** "Tue" */
export function formatWeekday(dayKey: string): string {
  const date = dayDate(dayKey);
  return date ? weekdayOnly.format(date) : dayKey;
}

/** Short timezone name, e.g. "MST", for a note next to times. */
export function timeZoneAbbreviation(timeZone: string, atIso?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(
      atIso ? new Date(atIso) : new Date(),
    );
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function durationMinutes(startIso: string, endIso: string): number | null {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : null;
}

export const MODE_LABEL: Record<SearchMode, string> = {
  hybrid: "Hybrid",
  keyword: "Keyword",
  semantic: "Meaning",
};

export const MODE_HINT: Record<SearchMode, string> = {
  hybrid: "Exact words and meaning, ranked together",
  keyword: "Exact words only",
  semantic: "Meaning only, even with different words",
};

export const ENGINE_LABEL: Record<Engine, string> = {
  elasticsearch: "Elasticsearch",
  "offline-fallback": "Offline fallback",
};

export const A11Y_KEYS: A11yKey[] = ["captions", "stepFree", "signLanguage", "lowSensory"];

export const A11Y_LABEL: Record<A11yKey, string> = {
  captions: "Captions",
  stepFree: "Step-free access",
  signLanguage: "Sign language",
  lowSensory: "Low sensory",
};

// "unknown" is reported as it is. The app never guesses accessibility facts.
export const TRI_LABEL: Record<Tri, string> = {
  yes: "Yes",
  no: "No",
  unknown: "Not published",
};

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
