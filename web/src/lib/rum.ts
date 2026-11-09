import type { Meta } from "../api";

let started = false;

/**
 * Real-user monitoring with Dash0's web SDK.
 *
 * It only starts when the server says monitoring is configured, and the SDK
 * is loaded lazily so it never delays the first search. The token the server
 * hands out is an ingest-only token made for browsers.
 */
export async function startRum(meta: Meta): Promise<void> {
  if (started || !meta.rum) return;
  started = true;
  try {
    const { init } = await import("@dash0/sdk-web");
    init({
      serviceName: meta.rum.serviceName,
      serviceVersion: meta.app.version,
      endpoint: { url: meta.rum.endpoint, authToken: meta.rum.token },
      // Join browser requests to the backend trace, for our own API only.
      propagators: [{ type: "traceparent", match: [/\/api\//] }],
    });
  } catch {
    // Monitoring must never break the app: a blocked script is not an error
    // the attendee should see.
    started = false;
  }
}
