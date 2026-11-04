import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { send } from "./api";
import { useAuth } from "./Auth";
import { Field, Notice, PageTitle } from "./UI";
export default function RecoveryPage() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const request = pathname === "/forgot-password" || pathname === "/reactivation";
  const title =
    pathname === "/verify-email"
      ? "Verify your email"
      : pathname === "/forgot-password"
        ? "Recover your account"
        : pathname === "/reset-password"
          ? "Set a new password"
          : "Reactivate your account";
  return (
    <>
      <PageTitle label="ACCOUNT SECURITY" title={title} />
      <form
        className="mvp-panel mvp-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const values = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const path =
              pathname === "/forgot-password" ? "/auth/forgot-password" : `/auth${pathname}`;
            const result = await send<{ message?: string }>(
              path,
              request ? values : { token, ...values },
            );
            setMessage(result.message || "Your request is complete. You can now sign in.");
            setDone(true);
            if (pathname === "/verify-email" && auth.user) await auth.refresh();
            else if (!request) auth.setUser(null);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        {request ? (
          <Field label="Account email">
            <input type="email" name="email" required autoComplete="email" maxLength={254} />
          </Field>
        ) : !token ? (
          <Notice error>This link is incomplete. Request a new email.</Notice>
        ) : pathname === "/reset-password" ? (
          <Field label="New password" hint="At least 12 characters. Use a unique password.">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </Field>
        ) : (
          <p>Confirm this account security request.</p>
        )}
        <button className="button primary" disabled={busy || done || (!request && !token)}>
          {busy ? "PLEASE WAIT…" : request ? "SEND INSTRUCTIONS" : "CONFIRM"}
        </button>
        <Link to="/login">Back to sign in</Link>
      </form>
    </>
  );
}
