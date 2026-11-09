# Accessibility

Samba Stack Overflow is accessibility-first: a conference tool that some
attendees cannot use fails at its one job. Review every change under `web/`
for these.

- Every interactive element is a real `<button>`, `<a>`, `<input>` or
  `<select>`, reachable by keyboard, with a visible focus ring. Flag `onClick`
  on a `<div>` or `<span>`.
- Every input has a programmatic label. Icon-only buttons have an
  `aria-label`. Decorative images and icons are hidden from assistive tech.
- Dialogs and sheets trap focus, close on Escape, and return focus to the
  element that opened them.
- Result counts, loading and errors are announced through an `aria-live`
  region. Colour is never the only signal (conflicts, match strength,
  accessibility status all carry text or an icon).
- Text and meaningful icons meet 4.5:1 contrast in both light and dark themes.
- All motion respects `prefers-reduced-motion`. Flag an animation with no
  reduced-motion path, and any animation on a keyboard-triggered action that
  delays the result.
- Touch targets are at least 44 by 44 CSS pixels. Layouts work at 360px wide
  and at 200% text size without horizontal scrolling.
- Session accessibility values of `unknown` render as "Not published", in
  words, never as an empty cell or a red cross.
