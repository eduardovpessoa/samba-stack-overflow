import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, describeError, type ChaosMode, type Meta, type SearchDiagnostics } from "../api";
import { copyText } from "../lib/clipboard";
import { ENGINE_LABEL, plural } from "../lib/format";
import { AutoThemeIcon, ChevronDownIcon, ListIcon, MoonIcon, SlidersIcon, SunIcon } from "./Icons";
import { BrandMark } from "./Shared";

export type TextScale = 1 | 1.125 | 1.25;
export type Theme = "auto" | "light" | "dark";

const SCALES: { value: TextScale; label: string }[] = [
  { value: 1, label: "Default" },
  { value: 1.125, label: "Large" },
  { value: 1.25, label: "Larger" },
];

const THEME_NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL: Record<Theme, string> = { auto: "Match my device", light: "Light", dark: "Dark" };

type HeaderProps = {
  setlistCount: number;
  showAsk: boolean;
  textScale: TextScale;
  onTextScale: (scale: TextScale) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
};

export function Header({ setlistCount, showAsk, textScale, onTextScale, theme, onTheme }: HeaderProps) {
  const ThemeIcon = theme === "auto" ? AutoThemeIcon : theme === "light" ? SunIcon : MoonIcon;
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Samba Stack Overflow, home">
        <BrandMark />
        <span className="wordmark__text">
          <span className="wordmark__samba">Samba</span>
          <span className="wordmark__rest">Stack Overflow</span>
        </span>
      </a>

      <nav className="site-nav" aria-label="Sections">
        <a href="#talks">Talks</a>
        <a href="#setlist">
          Setlist
          {setlistCount > 0 && (
            <span className="count count--small" aria-label={plural(setlistCount, "talk", "talks")}>
              {setlistCount}
            </span>
          )}
        </a>
        <a href="#roda">Roda</a>
        {showAsk && <a href="#ask">Ask</a>}
      </nav>

      <div className="display-controls">
        <div className="textsize" role="group" aria-label="Text size">
          {SCALES.map((scale, index) => (
            <button
              key={scale.value}
              type="button"
              className="textsize__option"
              data-step={index}
              aria-pressed={textScale === scale.value}
              aria-label={`${scale.label} text size`}
              title={`${scale.label} text size`}
              onClick={() => onTextScale(scale.value)}
            >
              A
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Theme: ${THEME_LABEL[theme]}. Change theme`}
          title={`Theme: ${THEME_LABEL[theme]}`}
          onClick={() => onTheme(THEME_NEXT[theme])}
        >
          <ThemeIcon />
        </button>
      </div>
    </header>
  );
}

type OpsProps = {
  meta: Meta;
  onChaosChange: (mode: ChaosMode) => void;
  /** From the most recent search, or null before any search or on an older server. */
  diagnostics: SearchDiagnostics | null;
};

/** A small drawer for the people running the demo. Kept out of the attendee's way. */
export function Ops({ meta, onChaosChange, diagnostics }: OpsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept in memory only: never written to storage or the URL.
  const [opsToken, setOpsToken] = useState("");
  const [traceCopy, setTraceCopy] = useState<"idle" | "copied" | "failed">("idle");
  const traceId = diagnostics?.traceId ?? null;

  // A new search means a new trace: the old "Copied" no longer applies.
  useEffect(() => {
    setTraceCopy("idle");
  }, [traceId]);

  const copyTrace = () => {
    if (!traceId) return;
    void copyText(traceId).then((ok) => setTraceCopy(ok ? "copied" : "failed"));
  };

  const on = meta.chaos.mode === "n-plus-one";
  const locked = meta.chaos.protected && opsToken.trim().length === 0;

  const toggle = () => {
    const next: ChaosMode = on ? "off" : "n-plus-one";
    setPending(true);
    setError(null);
    api
      .setChaos(next, meta.chaos.protected ? opsToken.trim() : undefined)
      .then((result) => onChaosChange(result.mode))
      .catch((cause: unknown) => setError(describeError(cause)))
      .finally(() => setPending(false));
  };

  return (
    <details className="ops">
      <summary className="ops__summary">
        <SlidersIcon size={18} />
        <span>Ops</span>
        {on && <span className="tag tag--warn">Practice incident on</span>}
        <ChevronDownIcon size={16} className="ops__chevron" />
      </summary>
      <div className="ops__panel">
        <dl className="ops__facts">
          <div>
            <dt>Version</dt>
            <dd>{meta.app.version}</dd>
          </div>
          <div>
            <dt>Team</dt>
            <dd>{meta.app.team}</dd>
          </div>
          <div>
            <dt>Search engine</dt>
            <dd>{ENGINE_LABEL[meta.search.engine]}</dd>
          </div>
          <div>
            <dt>Meaning search</dt>
            <dd>{meta.search.semantic ? "Available" : "Not available"}</dd>
          </div>
          {diagnostics && (
            <>
              <div>
                <dt>Served by</dt>
                <dd>{diagnostics.servedBy}</dd>
              </div>
              <div className="ops__trace">
                <dt>Last trace</dt>
                <dd>
                  <span>{traceId ?? "none"}</span>
                  {traceId && (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={copyTrace}
                      aria-label="Copy the trace id of the last search"
                    >
                      Copy
                    </button>
                  )}
                  <span className="ops__trace-status" role="status" aria-live="polite">
                    {traceCopy === "copied" ? "Copied" : traceCopy === "failed" ? "Couldn't copy: select it by hand" : ""}
                  </span>
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="ops__chaos">
          <div>
            <p className="ops__chaos-title" id="chaos-label">
              Practice incident: N+1 search regression
            </p>
            <p className="ops__chaos-text" id="chaos-desc">
              Makes search look up each result with its own Elasticsearch query instead of one batch. It is a real
              slowdown you can trace, not a pretend delay. Turn it off when you're done.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={on}
            aria-labelledby="chaos-label"
            aria-describedby="chaos-desc"
            disabled={pending || locked}
            onClick={toggle}
          >
            <span className="switch__thumb" />
          </button>
        </div>
        {meta.chaos.protected && (
          <label className="ops__token">
            <span className="field-label">Ops token</span>
            <input
              type="password"
              className="ops__token-input"
              value={opsToken}
              onChange={(event) => setOpsToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="ops-token-hint"
            />
            <span className="ops__token-hint" id="ops-token-hint">
              Only the people running this deployment can switch the incident on or off.
            </span>
          </label>
        )}
        {error && (
          <p className="ops__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

/** Phone-only bar that keeps the setlist one tap away while scrolling results. */
export function SetlistBar({ count, clashes }: { count: number; clashes: number }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.a
          className="setlist-bar"
          href="#setlist"
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: "0%" }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", duration: 0.4, bounce: 0 }}
        >
          <ListIcon size={18} />
          <span>
            Setlist · {plural(count, "talk", "talks")}
            {clashes > 0 && <span className="setlist-bar__clash"> · {plural(clashes, "overlap", "overlaps")}</span>}
          </span>
        </motion.a>
      )}
    </AnimatePresence>
  );
}
