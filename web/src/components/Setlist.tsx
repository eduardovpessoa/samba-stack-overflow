import { AnimatePresence, motion } from "motion/react";
import { agendaIcsUrl, type AgendaResponse, type Session } from "../api";
import { formatDayLong, formatTimeRange, plural } from "../lib/format";
import { AlertIcon, CalendarIcon, CloseIcon } from "./Icons";

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
};

export function Setlist({ items, conflicts, timeZone, loading, error, onRemove, onOpen, onClear, onRetry }: Props) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const liveConflicts = conflicts.filter((c) => byId.has(c.a) && byId.has(c.b));

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

  return (
    <aside className="setlist" id="setlist" aria-labelledby="setlist-title" aria-busy={loading}>
      <header className="setlist__head">
        <h2 id="setlist-title" className="section-title">
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
        <footer className="setlist__foot">
          <a className="btn btn--primary" href={agendaIcsUrl(items.map((i) => i.id))} download="samba-setlist.ics">
            <CalendarIcon size={18} />
            Add to calendar
          </a>
          <button type="button" className="btn btn--quiet" onClick={onClear}>
            Clear all
          </button>
        </footer>
      )}
    </aside>
  );
}
