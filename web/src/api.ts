// Typed client for the contract in docs/api.md. Keep this file in step with it.

export type Tri = "yes" | "no" | "unknown";

export type A11yKey = "captions" | "stepFree" | "signLanguage" | "lowSensory";

export type Speaker = { name: string; role: string; company: string };

export type Session = {
  id: string;
  title: string;
  description: string;
  speakers: Speaker[];
  track: string;
  format: "Keynote" | "Talk" | "Workshop" | "Lightning" | "Panel";
  level: "Beginner" | "Intermediate" | "Advanced";
  room: string;
  start: string;
  end: string;
  day: string;
  tags: string[];
  accessibility: Record<A11yKey, Tri>;
};

export type Segment = { text: string; hit: boolean };

export type SessionHit = Session & {
  score: number;
  ranks: { keyword: number | null; semantic: number | null };
  highlights: {
    title: Segment[] | null;
    description: Segment[] | null;
    semantic: Segment[] | null;
  };
  why: string[];
  speakerOtherTalks: number;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  company: string;
  building: string;
  interests: string[];
  lookingFor: string;
};

export type SearchMode = "hybrid" | "keyword" | "semantic";
export type Engine = "elasticsearch" | "offline-fallback";
export type ChaosMode = "off" | "n-plus-one";
export type Facet = { key: string; count: number };

export type Meta = {
  app: { name: string; version: string; team: string };
  conference: { name: string; timezone: string; dataset: "demo"; notice: string };
  search: { engine: Engine; semantic: boolean; modes: SearchMode[] };
  facets: { days: Facet[]; tracks: Facet[]; levels: Facet[]; formats: Facet[] };
  features: { ask: boolean };
  rum: { endpoint: string; token: string; serviceName: string } | null;
  chaos: { mode: ChaosMode; protected: boolean };
};

/** How one search was answered. Shown to people on purpose. */
export type SearchDiagnostics = {
  roundTrips: number;
  strategy: "batched" | "sequential";
  traceId: string | null;
  servedBy: string;
};

export type SearchResponse = {
  query: string;
  mode: SearchMode;
  engine: Engine;
  tookMs: number;
  total: number;
  results: SessionHit[];
  // Optional on purpose: an older server does not send it, and nothing breaks.
  diagnostics?: SearchDiagnostics;
};

export type SessionResponse = { session: Session; related: Session[] };

export type AgendaResponse = {
  items: Session[];
  conflicts: { a: string; b: string; overlapMinutes: number }[];
};

/** Talks that fit the free time around a setlist, closest in meaning first. */
export type SuggestResponse = { basedOn: number; results: Session[] };

export type SetlistSaved = { id: string; count: number };

/** A setlist someone saved and shared. It never changes once saved. */
export type SharedSetlist = {
  id: string;
  name: string;
  createdAt: string;
  items: Session[];
  conflicts: AgendaResponse["conflicts"];
};

export type PersonHit = Person & { score: number; highlight: Segment[] | null };

export type PeopleResponse = {
  demo: true;
  query: string;
  mode: "semantic" | "keyword";
  tookMs: number;
  results: PersonHit[];
};

export type AskResponse = { answer: string; sources: Session[]; model: string; grounded: true };

export type SearchParams = {
  q: string;
  mode: SearchMode;
  day?: string;
  track?: string;
  level?: string;
  a11y?: A11yKey[];
  size?: number;
};

/** An error the API described with the contract's error shape, or a network failure. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// A 503 is short-lived (the index is warming up after a restart, or a
// dependency hiccuped) and carries Retry-After in seconds. Wait that long and
// try once more before telling the person anything went wrong.
const RETRY_DEFAULT_SECONDS = 2;
const RETRY_MAX_SECONDS = 5;

function retryDelayMs(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header === null || header.trim() === "" ? Number.NaN : Number(header);
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : RETRY_DEFAULT_SECONDS;
  return Math.min(safe, RETRY_MAX_SECONDS) * 1000;
}

/** Resolves after `ms`, or rejects with an AbortError if the request is cancelled first. */
function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("network", "We couldn't reach the server. Check your connection and try again.", 0);
  }

  if (response.status === 503 && !isRetry) {
    const delay = retryDelayMs(response);
    void response.body?.cancel();
    await wait(delay, init?.signal);
    return request<T>(path, init, true);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body: handled below as an unexpected response.
  }

  if (!response.ok) {
    const err = isRecord(body) && isRecord(body.error) ? body.error : null;
    const code = err && typeof err.code === "string" ? err.code : "internal";
    const message =
      err && typeof err.message === "string"
        ? err.message
        : `The server answered with an error (${response.status}).`;
    throw new ApiError(code, message, response.status);
  }
  if (body === null) {
    throw new ApiError("internal", "The server sent a response we couldn't read.", response.status);
  }
  return body as T;
}

function postJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

export const api = {
  meta: (signal?: AbortSignal) => request<Meta>("/api/meta", { signal }),

  search: (params: SearchParams, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ q: params.q, mode: params.mode });
    if (params.day) qs.set("day", params.day);
    if (params.track) qs.set("track", params.track);
    if (params.level) qs.set("level", params.level);
    if (params.a11y && params.a11y.length > 0) qs.set("a11y", params.a11y.join(","));
    if (params.size) qs.set("size", String(params.size));
    return request<SearchResponse>(`/api/search?${qs.toString()}`, { signal });
  },

  session: (id: string, signal?: AbortSignal) =>
    request<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}`, { signal }),

  agenda: (ids: string[], signal?: AbortSignal) => postJson<AgendaResponse>("/api/agenda", { ids }, signal),

  suggest: (ids: string[], signal?: AbortSignal) =>
    postJson<SuggestResponse>("/api/agenda/suggest", { ids }, signal),

  saveSetlist: (ids: string[], signal?: AbortSignal) => postJson<SetlistSaved>("/api/setlists", { ids }, signal),

  setlist: (id: string, signal?: AbortSignal) =>
    request<SharedSetlist>(`/api/setlists/${encodeURIComponent(id)}`, { signal }),

  people: (q: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ q });
    return request<PeopleResponse>(`/api/people?${qs.toString()}`, { signal });
  },

  ask: (question: string, signal?: AbortSignal) => postJson<AskResponse>("/api/ask", { question }, signal),

  /** Flipping the practice switch needs the ops token wherever the server says it is protected. */
  setChaos: (mode: ChaosMode, opsToken?: string) =>
    request<{ mode: ChaosMode }>("/api/chaos", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opsToken ? { "X-Ops-Token": opsToken } : {}) },
      body: JSON.stringify({ mode }),
    }),
};

/** Link the browser can download directly. Ids are session ids, never personal data. */
export function agendaIcsUrl(ids: string[]): string {
  return `/api/agenda.ics?ids=${ids.map(encodeURIComponent).join(",")}`;
}

/** The link that opens a shared setlist. The id is a random setlist id, never personal data. */
export function sharedSetlistUrl(id: string): string {
  return `${window.location.origin}${window.location.pathname}?setlist=${encodeURIComponent(id)}`;
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong on our side. Please try again.";
}
