import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import {
  agendaIcsUrl,
  api,
  describeError,
  isAbort,
  sharedSetlistUrl,
  type AgendaResponse,
  type Session,
  type SharedSetlist,
} from "../api";
import { copyText } from "../lib/clipboard";
import { formatDay, formatDayLong, formatTimeRange, plural } from "../lib/format";
import type { AsyncState } from "../lib/hooks";
import { AlertIcon, CalendarIcon, CloseIcon, PlusIcon } from "./Icons";
import { Reminders } from "./Reminders";

type Props = {
  items: Session[];
  conflicts: AgendaResponse["conflicts"];
  timeZone: string;
  loading: boolean;
  error: string | null;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  onClear: () => void;
  onRetry: () => void;
  /** Adds a talk that is not in the setlist yet. */
  onAdd: (session: Session) => void;
};

type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: Session[] }
  | { status: "error"; message: string };

type ShareState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "ready"; url: string; copied: boolean }
  | { status: "error"; message: string };

const keyOf = (ids: string[]) => [...ids].sort().join(",");

const overlaps = (a: Session, b: Session) =>
  new Date(a.start).getTime() < new Date(b.end).getTime() && new Date(b.start).getTime() < new Date(a.end).getTime();

export function Setlist({ items, conflicts, timeZone, loading, error, onRemove, onOpen, onClear, onRetry, onAdd }: Props) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const liveConflicts = conflicts.filter((c) => byId.has(c.a) && byId.has(c.b));
  const ids = items.map((item) => item.id);
  const idsKey = keyOf(ids);
  const shareInputId = useId();

  const clashesFor = (id: string) =>
    liveConflicts
      .filter((c) => c.a === id || c.b === id)
      .map((c) => ({ other: byId.get(c.a === id ? c.b : c.a), minutes: c.overlapMinutes }))
      .filter((c): c is { other: Session; minutes: number } => c.other !== undefined);

  const days: { key: string; items: Session[] }[] = [];
  for (const item of items) {
    const last = days[days.length - 1];
    if (last && last.key === item.day) last.items.push(item);
    else days.push({ key: item.day, items: [item] });
  }

  // --- Fill my free time ----------------------------------------------------
  const [suggest, setSuggest] = useState<SuggestState>({ status: "idle" });
  // The exact setlist the suggestions were made for. If the setlist changes
  // any other way, they are stale and are dropped.
  const suggestedFor = useRef<string | null>(null);
  const suggestRequest = useRef<AbortController | null>(null);

  // --- Share ----------------------------------------------------------------
  const [share, setShare] = useState<ShareState>({ status: "idle" });
  const sharedFor = useRef<string | null>(null);
  const shareRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (suggestedFor.current !== null && suggestedFor.current !== idsKey) {
      suggestedFor.current = null;
      suggestRequest.current?.abort();
      setSuggest({ status: "idle" });
    }
    // A saved setlist never changes, so its link stops matching once this one does.
    if (sharedFor.current !== null && sharedFor.current !== idsKey) {
      sharedFor.current = null;
      shareRequest.current?.abort();
      setShare({ status: "idle" });
    }
  }, [idsKey]);

  useEffect(
    () => () => {
      suggestRequest.current?.abort();
      shareRequest.current?.abort();
    },
    [],
  );

  const fillFreeTime = () => {
    suggestRequest.current?.abort();
    const controller = new AbortController();
    suggestRequest.current = controller;
    suggestedFor.current = idsKey;
    setSuggest({ status: "loading" });
    api
      .suggest(ids, controller.signal)
      .then((data) => {
        // Never offer a talk that is already in the setlist.
        setSuggest({ status: "ready", results: data.results.filter((s) => !byId.has(s.id)).slice(0, 4) });
      })
      .catch((cause: unknown) => {
        if (isAbort(cause)) return;
        setSuggest({ status: "error", message: describeError(cause) });
      });
  };

  const addSuggestion = (session: Session) => {
    // The setlist is about to change because of this click: keep the other
    // suggestions, minus any that would now clash with the talk just added.
    suggestedFor.current = keyOf([...ids, session.id]);
    setSuggest((current) =>
      current.status === "ready"
        ? { status: "ready", results: current.results.filter((s) => s.id !== session.id && !overlaps(s, session)) }
        : current,
    );
    onAdd(session);
  };

  const shareSetlist = () => {
    shareRequest.current?.abort();
    const controller = new AbortController();
    shareRequest.current = controller;
    sharedFor.current = idsKey;
    setShare({ status: "saving" });
    api
      .saveSetlist(ids, controller.signal)
      .then(async (saved) => {
        const url = sharedSetlistUrl(saved.id);
        const copied = await copyText(url);
        if (controller.signal.aborted) return;
        setShare({ status: "ready", url, copied });
      })
      .catch((cause: unknown) => {
        if (isAbort(cause)) return;
        setShare({ status: "error", message: describeError(cause) });
      });
  };

  const copyShareLink = () => {
    if (share.status !== "ready") return;
    const { url } = share;
    void copyText(url).then((copied) => setShare({ status: "ready", url, copied }));
  };

  return (
    <aside className="setlist" id="setlist" aria-labelledby="setlist-title" aria-busy={loading}>
      <header className="setlist__head">
        <h2 id="setlist-title" className="section-title" tabIndex={-1}>
          Setlist
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={items.length}
              className="count"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
              aria-label={plural(items.length, "talk", "talks")}
            >
              {items.length}
            </motion.span>
          </AnimatePresence>
        </h2>
        <p className="section-sub">Your agenda: the talks you plan to catch.</p>
      </header>

      {error && (
        <div className="notice notice--error notice--small" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--small" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {items.length === 0 && !error && (
        <p className="setlist__empty">
          Nothing here yet. Add a talk and it lands in your setlist, sorted by time, with overlaps called out.
        </p>
      )}

      {liveConflicts.length > 0 && (
        <p className="clash-summary" role="status">
          <AlertIcon size={18} />
          <span>
            <strong>{plural(liveConflicts.length, "overlap", "overlaps")}.</strong> You can't be in two rooms at once, so
            pick one from each pair.
          </span>
        </p>
      )}

      {days.map((day) => (
        <section className="setlist__day" key={day.key} aria-label={formatDayLong(day.key)}>
          <h3 className="setlist__day-title">{formatDayLong(day.key)}</h3>
          <ul className="setlist__list">
            <AnimatePresence initial={false} mode="popLayout">
              {day.items.map((item) => {
                const clashes = clashesFor(item.id);
                return (
                  <motion.li
                    key={item.id}
                    className="setlist__item"
                    data-clash={clashes.length > 0}
                    layout="position"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14 } }}
                    transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                  >
                    <div className="setlist__main">
                      <p className="setlist__time">{formatTimeRange(item.start, item.end, timeZone)}</p>
                      <button type="button" className="setlist__title" onClick={() => onOpen(item.id)}>
                        {item.title}
                      </button>
                      <p className="setlist__room">{item.room}</p>
                      {clashes.map((clash) => (
                        <p className="setlist__clash" key={clash.other.id}>
                          <AlertIcon size={15} />
                          <span>
                            Overlaps “{clash.other.title}” by {clash.minutes} min
                          </span>
                        </p>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${item.title} from your setlist`}
                      onClick={() => onRemove(item.id)}
                    >
                      <CloseIcon size={18} />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      {items.length > 0 && (
        <section className="suggest" aria-labelledby="suggest-title" aria-busy={suggest.status === "loading"}>
          <div className="suggest__head">
            <h3 id="suggest-title" className="setlist__day-title">
              Fits your free time
            </h3>
            <p className="suggest__hint">Talks close to what you picked that don't clash with it.</p>
          </div>
          <button type="button" className="btn btn--small" onClick={fillFreeTime} disabled={suggest.status === "loading"}>
            {suggest.status === "loading" ? "Looking…" : suggest.status === "ready" ? "Look again" : "Fill my free time"}
          </button>

          <p className="visually-hidden" role="status" aria-live="polite">
            {suggest.status === "loading"
              ? "Looking for talks that fit your free time"
              : suggest.status === "ready"
                ? suggest.results.length > 0
                  ? `${plural(suggest.results.length, "suggestion", "suggestions")} for your free time`
                  : "No suggestions for your free time"
                : ""}
          </p>

          {suggest.status === "error" && (
            <div className="notice notice--error notice--small" role="alert">
              <p>{suggest.message}</p>
              <button type="button" className="btn btn--small" onClick={fillFreeTime}>
                Try again
              </button>
            </div>
          )}

          {suggest.status === "ready" && suggest.results.length === 0 && (
            <p className="suggest__hint">Your days are full, or nothing similar is left.</p>
          )}

          {suggest.status === "ready" && suggest.results.length > 0 && (
            <ul className="setlist__list">
              {suggest.results.map((item) => (
                <li className="setlist__item" key={item.id}>
                  <div className="setlist__main">
                    <p className="setlist__time">
                      {formatDay(item.day)} · {formatTimeRange(item.start, item.end, timeZone)}
                    </p>
                    <button type="button" className="setlist__title" onClick={() => onOpen(item.id)}>
                      {item.title}
                    </button>
                    <p className="setlist__room">
                      {item.room} · {item.level}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Add ${item.title} to your setlist`}
                    onClick={() => addSuggestion(item)}
                  >
                    <PlusIcon size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {items.length > 0 && (
        <footer className="setlist__foot">
          <a className="btn btn--primary" href={agendaIcsUrl(ids)} download="samba-setlist.ics">
            <CalendarIcon size={18} />
            Add to calendar
          </a>
          <button type="button" className="btn" onClick={shareSetlist} disabled={share.status === "saving"}>
            {share.status === "saving" ? "Saving…" : "Share setlist"}
          </button>
          <button type="button" className="btn btn--quiet" onClick={onClear}>
            Clear all
          </button>
        </footer>
      )}

      {items.length > 0 && share.status !== "idle" && (
        <div className="share">
          <p className="share__status" role="status" aria-live="polite">
            {share.status === "saving" && "Saving your setlist…"}
            {share.status === "ready" && (share.copied ? "Link copied. Anyone with it can open this setlist." : "Saved. Copy the link below to share it.")}
          </p>
          {share.status === "error" && (
            <div className="notice notice--error notice--small" role="alert">
              <p>{share.message}</p>
              <button type="button" className="btn btn--small" onClick={shareSetlist}>
                Try again
              </button>
            </div>
          )}
          {share.status === "ready" && (
            <div className="share__row">
              <label className="visually-hidden" htmlFor={shareInputId}>
                Link to this setlist
              </label>
              <input
                id={shareInputId}
                className="share__input"
                type="text"
                readOnly
                value={share.url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" className="btn btn--small" onClick={copyShareLink}>
                {share.copied ? "Copy again" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}

      <Reminders items={items} timeZone={timeZone} />
    </aside>
  );
}

type SharedProps = {
  state: AsyncState<SharedSetlist>;
  timeZone: string;
  onAddAll: (items: Session[]) => void;
  onDismiss: () => void;
  onRetry: () => void;
};

/** A setlist opened from a shared link. It is shown first and only merged on request. */
export function SharedSetlistPanel({ state, timeZone, onAddAll, onDismiss, onRetry }: SharedProps) {
  if (state.status === "idle") return null;
  const missing = state.status === "error" && state.code === "not_found";

  return (
    <section className="shared" aria-labelledby="shared-title" aria-busy={state.status === "loading"}>
      <div className="shared__head">
        <p className="tag">Shared setlist</p>
        <h2 id="shared-title" className="shared__title">
          {state.status === "ready"
            ? state.data.name.trim() !== ""
              ? state.data.name
              : "Someone shared a setlist with you"
            : missing
              ? "That shared setlist doesn't exist."
              : state.status === "error"
                ? "We couldn't open that shared setlist"
                : "Opening the shared setlist…"}
        </h2>
        {state.status === "ready" && <p className="section-sub">{plural(state.data.items.length, "talk", "talks")}</p>}
        {state.status === "error" && !missing && <p className="section-sub">{state.message}</p>}
        {missing && <p className="section-sub">The link may be mistyped. Your own setlist is untouched.</p>}
      </div>

      {state.status === "ready" && state.data.items.length > 0 && (
        <ul className="shared__list">
          {state.data.items.map((item) => (
            <li key={item.id} className="shared__item">
              <span className="shared__name">{item.title}</span>
              <span className="shared__meta">
                {formatDay(item.day)} · {formatTimeRange(item.start, item.end, timeZone)} · {item.room}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="shared__actions">
        {state.status === "ready" && state.data.items.length > 0 && (
          <button type="button" className="btn btn--primary" onClick={() => onAddAll(state.data.items)}>
            Add these to my setlist
          </button>
        )}
        {state.status === "error" && !missing && (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="btn btn--quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
