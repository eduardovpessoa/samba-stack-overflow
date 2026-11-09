import { useEffect, useRef, useState, type MouseEvent } from "react";
import { api, describeError, isAbort, type Session, type SessionResponse } from "../api";
import { durationMinutes, formatDayLong, formatTimeRange, timeZoneAbbreviation } from "../lib/format";
import { CheckIcon, CloseIcon, PlusIcon } from "./Icons";
import { A11yList } from "./Shared";

type Props = {
  sessionId: string | null;
  timeZone: string;
  agendaIds: string[];
  onToggleAgenda: (session: Session) => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onSeen: (sessions: Session[]) => void;
};

type Load =
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; data: SessionResponse }
  | { status: "error"; id: string; message: string };

/**
 * Session details in a native <dialog>: the browser gives us the focus trap,
 * Esc to close, an inert page behind, and focus returned to the trigger.
 * Enter and exit motion is CSS (see .sheet), so it can be interrupted.
 */
export function SessionSheet({ sessionId, timeZone, agendaIds, onToggleAgenda, onNavigate, onClose, onSeen }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [load, setLoad] = useState<Load | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The control that opened the sheet, so focus can go back to it on close.
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (sessionId && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!sessionId && dialog.open) dialog.close();
  }, [sessionId]);

  const handleClose = () => {
    // Browsers restore focus themselves; this covers the ones that don't.
    const trigger = returnFocus.current;
    returnFocus.current = null;
    if (trigger && trigger.isConnected && document.activeElement !== trigger) trigger.focus();
    onClose();
  };

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    setLoad({ status: "loading", id: sessionId });
    api
      .session(sessionId, controller.signal)
      .then((data) => {
        setLoad({ status: "ready", id: sessionId, data });
        onSeen([data.session, ...data.related]);
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setLoad({ status: "error", id: sessionId, message: describeError(error) });
      });
    return () => controller.abort();
    // onSeen only writes to a cache, so it is left out on purpose: a new
    // function identity must not restart the request.
  }, [sessionId, attempt]);

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) dialogRef.current?.close();
  };

  const session = load?.status === "ready" ? load.data.session : null;
  const related = load?.status === "ready" ? load.data.related : [];
  const inAgenda = session ? agendaIds.includes(session.id) : false;
  const minutes = session ? durationMinutes(session.start, session.end) : null;

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={handleClose}
      onClick={onBackdropClick}
    >
      <div className="sheet__panel">
        <header className="sheet__bar">
          <button type="button" className="icon-btn" aria-label="Close talk details" onClick={() => dialogRef.current?.close()}>
            <CloseIcon />
          </button>
        </header>

        {load?.status === "loading" && (
          <div className="sheet__body" aria-busy="true">
            <h2 id="sheet-title" className="visually-hidden">
              Loading talk details
            </h2>
            <div className="skeleton skeleton--title skeleton--big" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
          </div>
        )}

        {load?.status === "error" && (
          <div className="sheet__body">
            <h2 id="sheet-title" className="sheet__title">
              We couldn't load this talk
            </h2>
            <p role="alert">{load.message}</p>
            <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {session && (
          <div className="sheet__body">
            <h2 id="sheet-title" className="sheet__title">
              {session.title}
            </h2>

            <dl className="facts">
              <div>
                <dt>When</dt>
                <dd>
                  {formatDayLong(session.day)}
                  <br />
                  {formatTimeRange(session.start, session.end, timeZone)} {timeZoneAbbreviation(timeZone, session.start)}
                  {minutes !== null && <span className="facts__soft"> · {minutes} min</span>}
                </dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>{session.room}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>
                  {session.format} · {session.level}
                </dd>
              </div>
              <div>
                <dt>Track</dt>
                <dd>{session.track}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="btn btn--add btn--wide"
              aria-pressed={inAgenda}
              onClick={() => onToggleAgenda(session)}
            >
              {inAgenda ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
              <span>{inAgenda ? "In your setlist. Remove?" : "Add to setlist"}</span>
            </button>

            <p className="sheet__description">{session.description}</p>

            {session.speakers.length > 0 && (
              <section aria-labelledby="sheet-speakers">
                <h3 id="sheet-speakers" className="sheet__heading">
                  {session.speakers.length === 1 ? "Speaker" : "Speakers"}
                </h3>
                <ul className="speakers">
                  {session.speakers.map((speaker) => (
                    <li key={speaker.name}>
                      <span className="speakers__name">{speaker.name}</span>
                      <span className="speakers__role">
                        {[speaker.role, speaker.company].filter(Boolean).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="sheet-a11y">
              <h3 id="sheet-a11y" className="sheet__heading">
                Accessibility
              </h3>
              <A11yList accessibility={session.accessibility} />
              <p className="sheet__note">
                “Not published” means the organizers haven't told us. Ask at the registration desk before you plan around
                it.
              </p>
            </section>

            {session.tags.length > 0 && (
              <section aria-labelledby="sheet-tags">
                <h3 id="sheet-tags" className="sheet__heading">
                  Topics
                </h3>
                <ul className="tags">
                  {session.tags.map((tag) => (
                    <li className="tag" key={tag}>
                      {tag}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {related.length > 0 && (
              <section aria-labelledby="sheet-related">
                <h3 id="sheet-related" className="sheet__heading">
                  If you like this one
                </h3>
                <ul className="related">
                  {related.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="related__item" onClick={() => onNavigate(item.id)}>
                        <span className="related__title">{item.title}</span>
                        <span className="related__meta">
                          {formatDayLong(item.day)} · {formatTimeRange(item.start, item.end, timeZone)} · {item.room}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
