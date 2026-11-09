import { useRef, useState, type FormEvent } from "react";
import { api, describeError, isAbort, type AskResponse } from "../api";
import type { AsyncState } from "../lib/hooks";
import { formatDay, formatTimeRange } from "../lib/format";
import { Calcada } from "./Shared";

const MAX_LENGTH = 500;
const STARTER = "Which talks should I attend to understand production AI observability?";

type Props = { timeZone: string; onOpen: (id: string) => void };

/** Ask: a written answer built only from talks the search found. Rendered only when the backend offers it. */
export function Ask({ timeZone, onOpen }: Props) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AsyncState<AskResponse>>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  const run = (value: string) => {
    const q = value.trim();
    if (q === "") return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState({ status: "loading", previous: null });
    api
      .ask(q, next.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setState({ status: "error", message: describeError(error), code: "error" });
      });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(question);
  };

  const loading = state.status === "loading";

  return (
    <section className="ask" id="ask" aria-labelledby="ask-title">
      <div className="ask__intro">
        <h2 id="ask-title" className="section-title">
          Ask
        </h2>
        <p className="roda__lede">
          Ask a question about the schedule and get a short written answer. It only uses talks the search found, and it
          lists every one it used.
        </p>
      </div>

      <div className="ask__work">
        <form className="roda__form" onSubmit={submit}>
          <label htmlFor="ask-input" className="field-label">
            Your question
          </label>
          <textarea
            id="ask-input"
            className="textarea"
            rows={2}
            maxLength={MAX_LENGTH}
            value={question}
            placeholder={STARTER}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="roda__actions">
            <button type="submit" className="btn btn--primary" disabled={question.trim() === ""} data-loading={loading}>
              Ask
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => {
                setQuestion(STARTER);
                run(STARTER);
              }}
            >
              Use the example
            </button>
          </div>
        </form>

        <div aria-live="polite" aria-busy={loading}>
          {loading && (
            <>
              <p className="visually-hidden">Writing an answer…</p>
              <Calcada flowing rows={1} />
            </>
          )}

          {state.status === "error" && (
            <div className="notice notice--error notice--small" role="alert">
              <p>{state.message}</p>
              <button type="button" className="btn btn--small" onClick={() => run(question)}>
                Try again
              </button>
            </div>
          )}

          {state.status === "ready" && (
            <article className="answer">
              <p className="answer__text">{state.data.answer}</p>
              {state.data.sources.length > 0 && (
                <>
                  <h3 className="answer__heading">Talks this answer used</h3>
                  <ol className="related">
                    {state.data.sources.map((source) => (
                      <li key={source.id}>
                        <button type="button" className="related__item" onClick={() => onOpen(source.id)}>
                          <span className="related__title">{source.title}</span>
                          <span className="related__meta">
                            {formatDay(source.day)} · {formatTimeRange(source.start, source.end, timeZone)} · {source.room}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <p className="results__engine">
                <span>Written by {state.data.model}</span>
                <span>Grounded in {state.data.sources.length} indexed talks</span>
              </p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
