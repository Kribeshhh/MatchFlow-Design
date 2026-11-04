import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import Router from "./Router";
import { Loading, Notice } from "./UI";
const PortalPage = lazy(() => import("./PortalPage"));
export default function PortalBootstrap() {
  const [mode, setMode] = useState<"canonical" | "portal" | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/portal/context", {
      credentials: "omit",
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error("This hostname is not available.");
        const data = await r.json();
        if (!["canonical", "portal"].includes(data.mode))
          throw Error("Portal configuration is unavailable.");
        setMode(data.mode);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, []);
  if (error)
    return (
      <div className="mvp">
        <Notice error>{error}</Notice>
      </div>
    );
  if (!mode)
    return (
      <div className="mvp">
        <Loading />
      </div>
    );
  return mode === "canonical" ? (
    <Router />
  ) : (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <PortalPage custom />
      </Suspense>
    </BrowserRouter>
  );
}
