import { useEffect, useRef, useState } from "react";

/**
 * State mirrored to localStorage. Storage can be blocked (private windows,
 * strict settings), so every access is guarded and the app works without it.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: keep working in memory.
    }
  }, [key, value]);

  return [value, setValue];
}

/** Calls the handler for a plain key press that did not start inside a text field. */
export function useGlobalKey(key: string, handler: (event: KeyboardEvent) => void): void {
  const saved = useRef(handler);
  useEffect(() => {
    saved.current = handler;
  }, [handler]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      saved.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key]);
}

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading"; previous: T | null }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; code: string };
