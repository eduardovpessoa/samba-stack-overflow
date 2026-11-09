import { AnimatePresence, motion } from "motion/react";
import type { Meta, SearchMode, SearchResponse, SessionHit } from "../api";
import type { AsyncState } from "../lib/hooks";
import { ENGINE_LABEL, MODE_LABEL, formatDay, formatTimeRange, plural } from "../lib/format";
import { CheckIcon, ClockIcon, PinIcon, PlusIcon } from "./Icons";
import { EXAMPLE_PROMPTS } from "./SearchHero";
import { A11yList, Calcada, Highlight } from "./Shared";

type Props = {
  state: AsyncState<SearchResponse>;
  query: string;
  meta: Meta | null;
  timeZone: string;
  agendaIds: string[];
  filtersActive: boolean;
  mode: SearchMode;
  onToggleAgenda: (hit: SessionHit) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onTryPrompt: (prompt: string) => void;
  onModeChange: (mode: SearchMode) => void;
};

export function Results(props: Props) {
  const { state, query, meta, timeZone, agendaIds, filtersActive, mode } = props;
  const loading = state.status === "loading";
  const data = state.status === "ready" ? state.data : state.status === "loading" ? state.previous : null;

  let status = "";
  if (loading) status = "Searching…";
  else if (state.status === "ready") {
    status = state.data.total === 0 ? `No talks found for “${state.data.query}”` : `${plural(state.data.total, "talk", "talks")} for “${state.data.query}”`;
  } else if (state.status === "error") status = "Search failed";

  return (
    <section className="results" id="talks" aria-labelledby="talks-title" aria-busy={loading}>
      <header className="results__head">
        <h2 id="talks-title" className="section-title">
          Talks
        </h2>
        <p className="results__status" role="status" aria-live="polite">
          {status}
        </p>
        {state.status === "ready" && (
          <p className="results__engine">
            <span data-engine={state.data.engine}>{ENGINE_LABEL[state.data.engine]}</span>
            <span>{MODE_LABEL[state.data.mode]}</span>
            <span>{Math.round(state.data.tookMs)} ms</span>
          </p>
        )}
      </header>

      <Calcada flowing={loading} rows={1} />

      {state.status === "idle" && <Welcome meta={meta} />}

      {state.status === "error" && (
        <div className="notice notice--error" role="alert">
          <h3>We couldn't run that search</h3>
          <p>{state.message}</p>
          <button type="button" className="btn" onClick={props.onRetry}>
            Try again
          </button>
        </div>
      )}

      {loading && !data && <ResultSkeletons />}

      {data && data.results.length === 0 && state.status !== "error" && (
        <div className="notice">
          <h3>Nothing matched “{data.query}”</h3>
          <p>That happens. A few things that usually help:</p>
          <ul className="notice__actions">
            {filtersActive && (
              <li>
                <button type="button" className="btn" onClick={props.onClearFilters}>
                  Clear the filters
                </button>
              </li>
            )}
            {mode === "keyword" && meta?.search.modes.includes("hybrid") && (
              <li>
                <button type="button" className="btn" onClick={() => props.onModeChange("hybrid")}>
                  Match by meaning too
                </button>
              </li>
            )}
            {EXAMPLE_PROMPTS.slice(1, 3).map((prompt) => (
              <li key={prompt}>
                <button type="button" className="chip chip--example" onClick={() => props.onTryPrompt(prompt)}>
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.results.length > 0 && state.status !== "error" && (
        <ol className="result-list" data-stale={loading} aria-label={`Talks matching ${query}`}>
          <AnimatePresence initial={false} mode="popLayout">
            {data.results.map((hit, index) => (
              <motion.li
                key={hit.id}
                className="result"
                layout="position"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{
                  duration: 0.24,
                  ease: [0.23, 1, 0.32, 1],
                  delay: Math.min(index, 8) * 0.035,
                  layout: { type: "spring", duration: 0.35, bounce: 0 },
                }}
              >
                <ResultCard
                  hit={hit}
                  position={index + 1}
                  timeZone={timeZone}
                  inAgenda={agendaIds.includes(hit.id)}
                  onToggleAgenda={props.onToggleAgenda}
                  onOpen={props.onOpen}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function Welcome({ meta }: { meta: Meta | null }) {
  return (
    <div className="welcome">
      <h3 className="welcome__title">Tudo bem? Tell us what you're into.</h3>
      <p>
        Write a sentence, not keywords. You'll get talks ranked two ways at once, by the exact words and by meaning, with
        the reasons shown on every result.
      </p>
      <ul className="welcome__points">
        <li>
          <span className="rank" data-kind="keyword">
            Keyword <b>#1</b>
          </span>
          <span>The talk uses your words.</span>
        </li>
        <li>
          <span className="rank" data-kind="semantic">
            Meaning <b>#1</b>
          </span>
          <span>The talk is about what you meant, even in other words.</span>
        </li>
        <li>
          <span className="tag tag--plain">Not published</span>
          <span>Accessibility details we don't have. We never guess them.</span>
        </li>
      </ul>
      {meta && <p className="welcome__meta">Searching {meta.conference.name}.</p>}
    </div>
  );
}

function ResultSkeletons() {
  return (
    <ul className="result-list result-list--skeleton" aria-hidden="true">
      {[0, 1, 2, 3].map((n) => (
        <li className="result result--skeleton" key={n}>
          <div className="skeleton skeleton--when" />
          <div className="skeleton-stack">
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RankChips({ ranks }: { ranks: SessionHit["ranks"] }) {
  const label = [
    ranks.keyword === null ? "no exact-word match" : `keyword rank ${ranks.keyword}`,
    ranks.semantic === null ? "no meaning match" : `meaning rank ${ranks.semantic}`,
  ].join(", ");
  return (
    <p className="ranks">
      <span className="visually-hidden">How it ranked: {label}.</span>
      <span className="rank" data-kind="keyword" data-empty={ranks.keyword === null} aria-hidden="true">
        Keyword <b>{ranks.keyword === null ? "–" : `#${ranks.keyword}`}</b>
      </span>
      <span className="rank" data-kind="semantic" data-empty={ranks.semantic === null} aria-hidden="true">
        Meaning <b>{ranks.semantic === null ? "–" : `#${ranks.semantic}`}</b>
      </span>
    </p>
  );
}

type CardProps = {
  hit: SessionHit;
  position: number;
  timeZone: string;
  inAgenda: boolean;
  onToggleAgenda: (hit: SessionHit) => void;
  onOpen: (id: string) => void;
};

function ResultCard({ hit, position, timeZone, inAgenda, onToggleAgenda, onOpen }: CardProps) {
  const titleId = `talk-${hit.id}`;
  const snippet = hit.highlights.description ?? hit.highlights.semantic;
  const speakers = hit.speakers.map((s) => s.name).join(", ");

  return (
    <article className="talk" aria-labelledby={titleId}>
      <div className="talk__when">
        <span className="talk__position" aria-hidden="true">
          {String(position).padStart(2, "0")}
        </span>
        <span className="talk__day">{formatDay(hit.day)}</span>
        <span className="talk__time">
          <ClockIcon size={15} />
          {formatTimeRange(hit.start, hit.end, timeZone)}
        </span>
        <span className="talk__room">
          <PinIcon size={15} />
          {hit.room}
        </span>
      </div>

      <div className="talk__body">
        <h3 className="talk__title" id={titleId}>
          <button type="button" className="talk__open" onClick={() => onOpen(hit.id)}>
            {hit.highlights.title ? <Highlight segments={hit.highlights.title} /> : hit.title}
          </button>
        </h3>
        <p className="talk__meta">
          <span>{hit.format}</span>
          <span>{hit.level}</span>
          <span>{hit.track}</span>
        </p>
        {speakers && (
          <p className="talk__speakers">
            {speakers}
            {hit.speakerOtherTalks > 0 && (
              <span className="talk__more"> · {plural(hit.speakerOtherTalks, "more talk", "more talks")} by {hit.speakers.length > 1 ? "them" : "this speaker"}</span>
            )}
          </p>
        )}
        <p className="talk__snippet">{snippet ? <Highlight segments={snippet} /> : hit.description}</p>

        {hit.why.length > 0 && (
          <div className="why">
            <h4 className="why__label">Why it matched</h4>
            <ul className="why__list">
              {hit.why.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <A11yList accessibility={hit.accessibility} compact />
      </div>

      <div className="talk__side">
        <RankChips ranks={hit.ranks} />
        <button
          type="button"
          className="btn btn--add"
          aria-pressed={inAgenda}
          aria-label={inAgenda ? `Remove ${hit.title} from your setlist` : `Add ${hit.title} to your setlist`}
          onClick={() => onToggleAgenda(hit)}
        >
          {inAgenda ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
          <span>{inAgenda ? "In setlist" : "Add"}</span>
        </button>
      </div>
    </article>
  );
}
