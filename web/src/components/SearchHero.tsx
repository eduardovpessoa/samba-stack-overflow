import { motion } from "motion/react";
import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import type { A11yKey, Meta, SearchMode } from "../api";
import { A11Y_KEYS, A11Y_LABEL, MODE_HINT, MODE_LABEL, formatDay } from "../lib/format";
import { ArrowRightIcon, CheckIcon, SearchIcon } from "./Icons";

export const EXAMPLE_PROMPTS = [
  "I'm a backend dev, new to eBPF. Where do I start?",
  "Production AI observability",
  "Kubernetes security for beginners",
  "How do I make my conference talk more accessible?",
];

export const MAX_QUERY_LENGTH = 300;

export type Filters = { day: string; track: string; level: string; a11y: A11yKey[] };

export const EMPTY_FILTERS: Filters = { day: "", track: "", level: "", a11y: [] };

export function hasActiveFilters(filters: Filters): boolean {
  return filters.day !== "" || filters.track !== "" || filters.level !== "" || filters.a11y.length > 0;
}

const ALL_MODES: SearchMode[] = ["hybrid", "keyword", "semantic"];

type Props = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  loading: boolean;
  meta: Meta | null;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
};

export function SearchHero(props: Props) {
  const { draft, onDraftChange, onSubmit, inputRef, loading, meta, mode, onModeChange, filters, onFiltersChange } = props;
  const hintId = useId();
  const modeHintId = useId();
  const groupRef = useRef<HTMLDivElement>(null);

  // Grow the field with its text where `field-sizing: content` is missing.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, inputRef]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter searches, like a search box. Shift+Enter still makes a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit(draft);
    }
  };

  const allowedModes = meta?.search.modes ?? ALL_MODES;
  const semanticMissing = meta !== null && !meta.search.semantic;

  // Arrow keys move between modes, as in any radio group.
  const onModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const enabled = ALL_MODES.filter((m) => allowedModes.includes(m));
    const current = enabled.indexOf(mode);
    const next = enabled[(current + step + enabled.length) % enabled.length];
    if (!next) return;
    onModeChange(next);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  };

  const toggleA11y = (key: A11yKey) => {
    const next = filters.a11y.includes(key) ? filters.a11y.filter((k) => k !== key) : [...filters.a11y, key];
    onFiltersChange({ ...filters, a11y: next });
  };

  const remaining = MAX_QUERY_LENGTH - draft.length;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <HeroArt />
      <div className="hero__inner">
        <h1 id="hero-title" className="hero__title">
          Find your talk. <span className="hero__title-2">Find your people.</span>
        </h1>
        <p className="hero__lede">
          Say what you're into, in your own words. Every result shows why it matched, so you can trust the pick.
        </p>

        <form className="search" role="search" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="search-input">
            What do you want to learn?
          </label>
          <div className="search__box">
            <SearchIcon className="search__icon" size={22} />
            <textarea
              id="search-input"
              ref={inputRef}
              className="search__input"
              rows={1}
              value={draft}
              maxLength={MAX_QUERY_LENGTH}
              placeholder="I work on platform teams and want to learn observability…"
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="search"
              spellCheck
              aria-describedby={hintId}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <kbd className="search__kbd" aria-hidden="true">
              /
            </kbd>
            <button className="btn btn--primary search__go" type="submit" disabled={draft.trim() === ""} data-loading={loading}>
              <span>Bora!</span>
              <span className="visually-hidden">Search talks</span>
              <ArrowRightIcon size={18} />
            </button>
          </div>
          <p className="search__hint" id={hintId}>
            <span>
              <em>Bora</em> means “let's go”. Press <kbd>/</kbd> to jump here, Enter to search.
            </span>
            {remaining <= 60 && (
              <span className="search__count" aria-live="polite">
                {remaining} characters left
              </span>
            )}
          </p>
        </form>

        <div className="examples">
          <p className="examples__label" id="examples-label">
            Try one of these
          </p>
          <ul className="examples__list" aria-labelledby="examples-label">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button type="button" className="chip chip--example" onClick={() => onSubmit(prompt)}>
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="controls">
          <div className="control">
            <span className="control__label" id="mode-label">
              Match by
            </span>
            <div
              className="segmented"
              role="radiogroup"
              aria-labelledby="mode-label"
              aria-describedby={modeHintId}
              ref={groupRef}
              onKeyDown={onModeKeyDown}
            >
              {ALL_MODES.map((m) => {
                const enabled = allowedModes.includes(m);
                const selected = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={!enabled}
                    tabIndex={selected ? 0 : -1}
                    data-mode={m}
                    className="segmented__option"
                    title={enabled ? MODE_HINT[m] : "Not available on this search engine"}
                    onClick={() => enabled && onModeChange(m)}
                  >
                    {selected && (
                      <motion.span
                        layoutId="mode-pill"
                        className="segmented__pill"
                        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                      />
                    )}
                    <span className="segmented__text">{MODE_LABEL[m]}</span>
                  </button>
                );
              })}
            </div>
            <p className="control__hint" id={modeHintId}>
              {semanticMissing
                ? "Meaning search isn't available on this engine, so only exact-word matching is offered."
                : MODE_HINT[mode] + "."}
            </p>
          </div>

          {meta && meta.facets.days.length > 0 && (
            <fieldset className="control">
              <legend className="control__label">Day</legend>
              <div className="chips chips--scroll">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={filters.day === ""}
                  onClick={() => onFiltersChange({ ...filters, day: "" })}
                >
                  All days
                </button>
                {meta.facets.days.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    className="chip"
                    aria-pressed={filters.day === day.key}
                    onClick={() => onFiltersChange({ ...filters, day: filters.day === day.key ? "" : day.key })}
                  >
                    {formatDay(day.key)}
                    <span className="chip__count" aria-label={`${day.count} talks`}>
                      {day.count}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {meta && (meta.facets.tracks.length > 0 || meta.facets.levels.length > 0) && (
            <div className="control control--selects">
              {meta.facets.tracks.length > 0 && (
                <label className="select">
                  <span className="control__label">Track</span>
                  <select value={filters.track} onChange={(event) => onFiltersChange({ ...filters, track: event.target.value })}>
                    <option value="">All tracks</option>
                    {meta.facets.tracks.map((track) => (
                      <option key={track.key} value={track.key}>
                        {track.key} ({track.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {meta.facets.levels.length > 0 && (
                <label className="select">
                  <span className="control__label">Level</span>
                  <select value={filters.level} onChange={(event) => onFiltersChange({ ...filters, level: event.target.value })}>
                    <option value="">Any level</option>
                    {meta.facets.levels.map((level) => (
                      <option key={level.key} value={level.key}>
                        {level.key} ({level.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <fieldset className="control">
            <legend className="control__label">I need</legend>
            <div className="chips">
              {A11Y_KEYS.map((key) => {
                const pressed = filters.a11y.includes(key);
                return (
                  <button key={key} type="button" className="chip chip--need" aria-pressed={pressed} onClick={() => toggleA11y(key)}>
                    {pressed && <CheckIcon size={16} />}
                    {A11Y_LABEL[key]}
                  </button>
                );
              })}
            </div>
            <p className="control__hint">Shows only talks where the organizers confirmed it. Unknown is never counted as yes.</p>
          </fieldset>
        </div>
      </div>
    </section>
  );
}

/** A canary sun with calçada waves cut through it. Decoration only, wide screens only. */
function HeroArt() {
  const band = (y: number) =>
    `M0 ${y} Q26.670 ${y - 13} 53.330 ${y} T106.670 ${y} T160 ${y} T213.330 ${y} T266.670 ${y} T320 ${y} V${y + 15} ` +
    `Q293.330 ${y + 28} 266.670 ${y + 15} T213.330 ${y + 15} T160 ${y + 15} T106.670 ${y + 15} T53.330 ${y + 15} T0 ${y + 15} Z`;
  return (
    <div className="hero__art" aria-hidden="true">
      <svg viewBox="0 0 320 300" focusable="false">
        <circle cx="160" cy="140" r="128" className="hero__sun" />
        {[150, 190, 230].map((y) => (
          <path key={y} d={band(y)} className="hero__cut" />
        ))}
      </svg>
    </div>
  );
}
