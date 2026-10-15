"use client";

import { useEffect } from "react";

// Registers the offline shell in production only: a service worker in dev
// would cache hot-reloaded chunks and make changes look like they didn't
// apply.
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {});
  }, []);
  return null;
}
