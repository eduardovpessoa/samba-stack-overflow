import type { A11yKey, Segment, Session, Tri } from "../api";
import { A11Y_KEYS, A11Y_LABEL, TRI_LABEL } from "../lib/format";
import { CaptionsIcon, LowSensoryIcon, SignLanguageIcon, StepFreeIcon } from "./Icons";

/**
 * Renders highlighted text from the API. Segments are plain strings, so React
 * escapes them: no HTML from the server is ever injected.
 */
export function Highlight({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        const text = printable(segment.text);
        return segment.hit ? <mark key={index}>{text}</mark> : <span key={index}>{text}</span>;
      })}
    </>
  );
}

// Control characters have no glyph and show up as empty boxes, so they are
// never rendered, whatever the source text contains.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function printable(text: string): string {
  return text.replace(CONTROL_CHARACTERS, "");
}

const A11Y_ICON: Record<A11yKey, typeof CaptionsIcon> = {
  captions: CaptionsIcon,
  stepFree: StepFreeIcon,
  signLanguage: SignLanguageIcon,
  lowSensory: LowSensoryIcon,
};

/**
 * Accessibility facts for a session. "unknown" is shown as "Not published",
 * in words, and is never styled as a yes or a no.
 */
export function A11yList({ accessibility, compact = false }: { accessibility: Session["accessibility"]; compact?: boolean }) {
  return (
    <dl className={compact ? "a11y a11y--compact" : "a11y"} aria-label="Accessibility">
      {A11Y_KEYS.map((key) => {
        const value: Tri = accessibility[key] ?? "unknown";
        const IconFor = A11Y_ICON[key];
        return (
          <div className="a11y__item" data-state={value} key={key}>
            <dt>
              <IconFor size={16} />
              {A11Y_LABEL[key]}
            </dt>
            <dd>{TRI_LABEL[value]}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The calçada wave strip: Copacabana's pavement, used once or twice as a signature. */
export function Calcada({ flowing = false, rows = 2 }: { flowing?: boolean; rows?: 1 | 2 }) {
  return (
    <div className="calcada" data-flowing={flowing} data-rows={rows} aria-hidden="true">
      <div className="calcada__band" />
    </div>
  );
}

/** Original mark: a pandeiro-like disc carrying a calçada wave. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brandmark">
      <circle cx="16" cy="16" r="15" className="brandmark__disc" />
      <path d="M3 13 Q9.500 7 16 13 T29 13 V17 Q22.500 23 16 17 T3 17 Z" className="brandmark__wave" />
      <path d="M6 22 Q11 18.500 16 22 T26 22" className="brandmark__line" />
    </svg>
  );
}
