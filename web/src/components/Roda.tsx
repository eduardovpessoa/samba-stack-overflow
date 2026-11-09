import { useRef, useState, type FormEvent } from "react";
import { api, describeError, isAbort, type PeopleResponse } from "../api";
import type { AsyncState } from "../lib/hooks";
import { plural } from "../lib/format";
import { PeopleIcon } from "./Icons";
import { Calcada, Highlight } from "./Shared";

const MAX_LENGTH = 500;
const STARTER = "I'm building an AI-powered healthcare scheduling platform with Go, Kubernetes and PostgreSQL.";

/** Roda: find people building something close to what you're building. */
export function Roda() {
  const [text, setText] = useState("");
  const [state, setState] = useState<AsyncState<PeopleResponse>>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  const run = (value: string) => {
    const q = value.trim();
    if (q === "") return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState((previous) => ({ status: "loading", previous: previous.status === "ready" ? previous.data : null }));
    api
      .people(q, next.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setState({ status: "error", message: describeError(error), code: "error" });
      });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(text);
  };

  const loading = state.status === "loading";
  const data = state.status === "ready" ? state.data : state.status === "loading" ? state.previous : null;

  return (
    <section className="roda" id="roda" aria-labelledby="roda-title">
      <div className="roda__intro">
        <h2 id="roda-title" className="section-title">
          Roda
        </h2>
        <p className="roda__lede">
          Find your people. A <em>roda</em> is the circle where samba happens: everyone brings something. Tell us what
          you're building and we'll find who you should meet.
        </p>
        <p className="demo-note">
          <PeopleIcon size={18} />
          <span>
            <strong>Demo profiles.</strong> These people are made up for the demo. They are not real attendees.
          </span>
        </p>
      </div>

      <div className="roda__work">
        <form className="roda__form" onSubmit={submit}>
          <label htmlFor="roda-input" className="field-label">
            What are you building?
          </label>
          <textarea
            id="roda-input"
            className="textarea"
            rows={3}
            maxLength={MAX_LENGTH}
            value={text}
            placeholder={STARTER}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="roda__actions">
            <button type="submit" className="btn btn--primary" disabled={text.trim() === ""} data-loading={loading}>
              Find my roda
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => {
                setText(STARTER);
                run(STARTER);
              }}
            >
              Use the example
            </button>
          </div>
        </form>

        <div className="roda__results" aria-busy={loading}>
          <p className="visually-hidden" role="status" aria-live="polite">
            {loading ? "Looking for people…" : state.status === "ready" ? `${plural(state.data.results.length, "demo profile", "demo profiles")} found` : ""}
          </p>

          {loading && <Calcada flowing rows={1} />}

          {state.status === "error" && (
            <div className="notice notice--error notice--small" role="alert">
              <p>{state.message}</p>
              <button type="button" className="btn btn--small" onClick={() => run(text)}>
                Try again
              </button>
            </div>
          )}

          {data && data.results.length === 0 && state.status !== "error" && (
            <p className="notice notice--small">No close matches. Try naming the tools you use or the problem you're solving.</p>
          )}

          {data && data.results.length > 0 && state.status !== "error" && (
            <>
              <p className="results__engine">
                <span>{data.mode === "semantic" ? "Matched by meaning" : "Matched by exact words"}</span>
                <span>{Math.round(data.tookMs)} ms</span>
              </p>
              <ul className="people" data-stale={loading}>
                {data.results.map((person) => (
                  <li className="person" key={person.id}>
                    <div className="person__head">
                      <h3 className="person__name">{person.name}</h3>
                      <span className="tag tag--demo">Demo profile</span>
                    </div>
                    <p className="person__role">{[person.role, person.company].filter(Boolean).join(", ")}</p>
                    <p className="person__building">
                      {person.highlight ? <Highlight segments={person.highlight} /> : person.building}
                    </p>
                    {person.lookingFor && (
                      <p className="person__looking">
                        <span className="person__label">Looking for</span> {person.lookingFor}
                      </p>
                    )}
                    {person.interests.length > 0 && (
                      <ul className="tags" aria-label={`${person.name}'s interests`}>
                        {person.interests.map((interest) => (
                          <li className="tag" key={interest}>
                            {interest}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
