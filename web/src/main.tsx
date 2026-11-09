import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./styles/tokens.css";
import "./styles/app.css";

import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

// The service worker makes the app installable and keeps the page shell
// available when the venue wifi drops. Production only, so it never caches a
// development build. It never handles /api/ (see public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not being installable is not an error the attendee should see.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
