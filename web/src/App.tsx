import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  describeError,
  isAbort,
  type AgendaResponse,
  type ChaosMode,
  type Meta,
  type SearchMode,
  type SearchResponse,
  type Session,
} from "./api";
import { Ask } from "./components/Ask";
import { Header, Ops, SetlistBar, type TextScale, type Theme } from "./components/Chrome";
import { Results } from "./components/Results";
import { EMPTY_FILTERS, MAX_QUERY_LENGTH, SearchHero, hasActiveFilters, type Filters } from "./components/SearchHero";
import { SessionSheet } from "./components/SessionSheet";
import { Setlist } from "./components/Setlist";
import { Roda } from "./components/Roda";
import { Calcada } from "./components/Shared";
import { timeZoneAbbreviation } from "./lib/format";
import { useGlobalKey, useStoredState, type AsyncState } from "./lib/hooks";
import { startRum } from "./lib/rum";

const MAX_AGENDA = 60;
const META_AUTO_RETRIES = 5;

const isMode = (value: unknown): value is SearchMode => value === "hybrid" || value === "keyword" || value === "semantic";
const isScale = (value: unknown): value is TextScale => value === 1 || value === 1.125 || value === 1.25;
const isTheme = (value: unknown): value is Theme => value === "auto" || value === "light" || value === "dark";
const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_AGENDA && value.every((item) => typeof item === "string");

function readQueryFromUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  } catch {
    return "";
  }
}

export function App() {
  // --- Server facts -------------------------------------------------------
  const [meta, setMeta] = useState<AsyncState<Meta>>({ status: "loading", previous: null });
  const [metaAttempt, setMetaAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let retry: number | undefined;
    // While retrying after a failure the error stays on screen instead of
    // blinking away and back.
    setMeta((current) => (current.status === "error" ? current : { status: "loading", previous: null }));
    api
      .meta(controller.signal)
      .then((data) => {
        setMeta({ status: "ready", data });
        void startRum(data);
        // The server is back: rerun a search that failed while it was away.
        if (metaAttempt > 0) setSearchAttempt((n) => n + 1);
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setMeta({ status: "error", message: describeError(error), code: error instanceof ApiError ? error.code : "internal" });
        // A server that is still starting recovers on its own: try a few
        // more times quietly before leaving it to the "Try again" button.
        if (metaAttempt < META_AUTO_RETRIES) retry = window.setTimeout(() => setMetaAttempt((n) => n + 1), 4000);
      });
    return () => {
      controller.abort();
      window.clearTimeout(retry);
    };
  }, [metaAttempt]);

  const metaData = meta.status === "ready" ? meta.data : null;
  // Until /api/meta answers there is no trusted timezone, so UTC is shown
  // rather than silently using the browser's.
  const timeZone = metaData?.conference.timezone ?? "UTC";

  // --- Display preferences ------------------------------------------------
  const [textScale, setTextScale] = useStoredState<TextScale>("sso.textScale", 1, isScale);
  const [theme, setTheme] = useStoredState<Theme>("sso.theme", "auto", isTheme);

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(textScale));
  }, [textScale]);

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  // --- Search -------------------------------------------------------------
  const initialQuery = useMemo(readQueryFromUrl, []);
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [storedMode, setStoredMode] = useStoredState<SearchMode>("sso.mode", "hybrid", isMode);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState<AsyncState<SearchResponse>>({ status: "idle" });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionCache = useRef(new Map<string, Session>());

  // Only offer modes the engine really has. A stored "hybrid" falls back to
  // the first honest mode when meaning search is missing.
  const mode: SearchMode =
    metaData && !metaData.search.modes.includes(storedMode) ? (metaData.search.modes[0] ?? "keyword") : storedMode;

  const rememberSessions = useCallback((sessions: Session[]) => {
    for (const session of sessions) sessionCache.current.set(session.id, session);
  }, []);

  const metaSettled = meta.status !== "loading";

  useEffect(() => {
    const q = query.trim();
    if (q === "") {
      setSearch({ status: "idle" });
      return;
    }
    if (!metaSettled) {
      // Still learning what the engine offers: show the search as loading.
      setSearch((previous) => (previous.status === "loading" ? previous : { status: "loading", previous: null }));
      return;
    }
    const controller = new AbortController();
    setSearch((previous) => ({ status: "loading", previous: previous.status === "ready" ? previous.data : previous.status === "loading" ? previous.previous : null }));
    api
      .search({ q, mode, day: filters.day, track: filters.track, level: filters.level, a11y: filters.a11y }, controller.signal)
      .then((data) => {
        rememberSessions(data.results);
        setSearch({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setSearch({ status: "error", message: describeError(error), code: error instanceof ApiError ? error.code : "internal" });
      });
    return () => controller.abort();
  }, [query, mode, filters, metaSettled, searchAttempt, rememberSessions]);

  // Keep ?q= in step so a search can be shared as a link.
  useEffect(() => {
    const q = query.trim();
    const url = q ? `${window.location.pathname}?q=${encodeURIComponent(q)}${window.location.hash}` : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [query]);

  const submit = useCallback((value: string) => {
    const next = value.trim().slice(0, MAX_QUERY_LENGTH);
    setDraft(next);
    if (next === "") return;
    setQuery(next);
    setSearchAttempt((n) => n + 1);
    // Bring the results into view when they would land below the fold.
    // Focus stays in the field so the query can be refined right away.
    requestAnimationFrame(() => {
      const talks = document.getElementById("talks");
      if (!talks || talks.getBoundingClientRect().top < window.innerHeight * 0.6) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      talks.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }, []);

  useGlobalKey("/", (event) => {
    event.preventDefault();
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  // --- Setlist (agenda) ---------------------------------------------------
  const [agendaIds, setAgendaIds] = useStoredState<string[]>("sso.agenda", [], isIdList);
  const [agenda, setAgenda] = useState<AgendaResponse | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [agendaAttempt, setAgendaAttempt] = useState(0);

  useEffect(() => {
    if (agendaIds.length === 0) {
      setAgenda(null);
      setAgendaError(null);
      setAgendaLoading(false);
      return;
    }
    const controller = new AbortController();
    setAgendaLoading(true);
    api
      .agenda(agendaIds, controller.signal)
      .then((data) => {
        rememberSessions(data.items);
        setAgenda(data);
        setAgendaError(null);
        setAgendaLoading(false);
        // The server ignores ids it doesn't know. Drop them so the count stays honest.
        const known = new Set(data.items.map((item) => item.id));
        if (agendaIds.some((id) => !known.has(id))) setAgendaIds(agendaIds.filter((id) => known.has(id)));
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setAgendaError(describeError(error));
        setAgendaLoading(false);
      });
    return () => controller.abort();
  }, [agendaIds, agendaAttempt, rememberSessions, setAgendaIds]);

  // Show a talk the moment it's added, from what we already know about it;
  // the server's answer then supplies the order and the overlaps.
  const agendaItems = useMemo(() => {
    const fromServer = new Map((agenda?.items ?? []).map((item) => [item.id, item]));
    return agendaIds
      .map((id) => fromServer.get(id) ?? sessionCache.current.get(id))
      .filter((item): item is Session => item !== undefined)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime() || a.title.localeCompare(b.title));
  }, [agendaIds, agenda]);

  const agendaConflicts = useMemo(() => {
    const present = new Set(agendaIds);
    return (agenda?.conflicts ?? []).filter((c) => present.has(c.a) && present.has(c.b));
  }, [agenda, agendaIds]);

  const toggleAgenda = useCallback(
    (session: Session) => {
      rememberSessions([session]);
      setAgendaIds((ids) => (ids.includes(session.id) ? ids.filter((id) => id !== session.id) : [...ids, session.id].slice(-MAX_AGENDA)));
    },
    [rememberSessions, setAgendaIds],
  );

  // --- Details sheet ------------------------------------------------------
  const [detailId, setDetailId] = useState<string | null>(null);

  const onChaosChange = (chaosMode: ChaosMode) => {
    setMeta((current) => (current.status === "ready" ? { status: "ready", data: { ...current.data, chaos: { mode: chaosMode } } } : current));
  };

  const offline = metaData !== null && metaData.search.engine !== "elasticsearch";
  const tzNote = metaData ? `Times are in ${metaData.conference.timezone.replace(/_/g, " ")} (${timeZoneAbbreviation(timeZone)}).` : "";

  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#talks">
        Skip to talks
      </a>

      {metaData && (
        <p className="dataset-line">
          <span className="dataset-line__dot" aria-hidden="true" />
          {metaData.conference.notice}
        </p>
      )}

      <Header
        setlistCount={agendaIds.length}
        showAsk={metaData?.features.ask ?? false}
        textScale={textScale}
        onTextScale={setTextScale}
        theme={theme}
        onTheme={setTheme}
      />

      <main id="main">
        <SearchHero
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submit}
          inputRef={inputRef}
          loading={search.status === "loading"}
          meta={metaData}
          mode={mode}
          onModeChange={setStoredMode}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <Calcada />

        {meta.status === "error" && (
          <div className="banner banner--error" role="alert">
            <p>
              <strong>We can't reach the conference data right now.</strong> {meta.message}
            </p>
            <button type="button" className="btn btn--small" onClick={() => setMetaAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {offline && (
          <div className="banner banner--warn" role="status">
            <p>
              <strong>Offline fallback.</strong> Results are coming from a simple built-in matcher, not Elasticsearch,
              so meaning search is off and ranking is rough.
            </p>
          </div>
        )}

        <div className="layout">
          <Results
            state={search}
            query={query}
            meta={metaData}
            timeZone={timeZone}
            agendaIds={agendaIds}
            filtersActive={hasActiveFilters(filters)}
            mode={mode}
            onToggleAgenda={toggleAgenda}
            onOpen={setDetailId}
            onRetry={() => setSearchAttempt((n) => n + 1)}
            onClearFilters={() => setFilters(EMPTY_FILTERS)}
            onTryPrompt={submit}
            onModeChange={setStoredMode}
          />

          <Setlist
            items={agendaItems}
            conflicts={agendaConflicts}
            timeZone={timeZone}
            loading={agendaLoading}
            error={agendaError}
            onRemove={(id) => setAgendaIds((ids) => ids.filter((item) => item !== id))}
            onOpen={setDetailId}
            onClear={() => setAgendaIds([])}
            onRetry={() => setAgendaAttempt((n) => n + 1)}
          />
        </div>

        <Roda />

        {metaData?.features.ask && <Ask timeZone={timeZone} onOpen={setDetailId} />}
      </main>

      <footer className="site-footer">
        <Calcada rows={1} />
        <div className="site-footer__inner">
          <div className="site-footer__text">
            <p className="site-footer__brand">Samba Stack Overflow</p>
            <p>Find your talk. Find your people.</p>
            {metaData && <p>{metaData.conference.notice}</p>}
            {tzNote && <p>{tzNote}</p>}
            <p>An independent hackathon project. Not affiliated with Stack Overflow.</p>
          </div>
          {metaData && <Ops meta={metaData} onChaosChange={onChaosChange} />}
        </div>
      </footer>

      <SessionSheet
        sessionId={detailId}
        timeZone={timeZone}
        agendaIds={agendaIds}
        onToggleAgenda={toggleAgenda}
        onNavigate={setDetailId}
        onClose={() => setDetailId(null)}
        onSeen={rememberSessions}
      />

      <SetlistBar count={agendaItems.length} clashes={agendaConflicts.length} />
    </MotionConfig>
  );
}
