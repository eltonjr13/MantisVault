import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/app.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/service-worker.js")
      .then(cacheCurrentAppShell)
      .catch((reason: unknown) => {
        console.warn("Nao foi possivel ativar o modo offline.", reason);
      });
  });
}

async function cacheCurrentAppShell(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const urls = new Set<string>([
    new URL("/", window.location.origin).toString(),
    new URL("/index.html", window.location.origin).toString(),
    new URL("/manifest.webmanifest", window.location.origin).toString(),
    new URL("/icon.svg", window.location.origin).toString()
  ]);

  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[href]").forEach((element) => {
    const url = element instanceof HTMLScriptElement ? element.src : element.href;

    if (url && new URL(url, window.location.href).origin === window.location.origin) {
      urls.add(new URL(url, window.location.href).toString());
    }
  });

  registration.active?.postMessage({
    type: "CACHE_URLS",
    urls: [...urls]
  });
}
