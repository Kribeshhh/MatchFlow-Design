import { useConfirm } from "./DesignSystem";
import { useState } from "react";
import { api, send, useResource } from "./api";
import { Field, Loading, Notice, ResourceError } from "./UI";
export default function StaffAuthentication({
  children,
  management = false,
}: {
  children?: React.ReactNode;
  management?: boolean;
}) {
  const confirm = useConfirm();
  const r = useResource<{ configured: boolean; enrolled: boolean; verified: boolean }>(
    "/account/staff-factor",
  );
  const [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [otp, setOtp] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (r.loading) return <Loading />;
  if (!r.data) return <ResourceError message={r.error} retry={r.refresh} />;
  if (codes.length)
    return (
      <section className="mvp-panel">
        <h2>Save your recovery codes</h2>
        <p>Each code works once. Store them privately before continuing.</p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{codes.join("\n")}</pre>
        <button
          className="button primary"
          onClick={() => {
            setCodes([]);
            r.refresh();
          }}
        >
          I HAVE SAVED MY CODES
        </button>
      </section>
    );
  if (r.data.verified && !management) return <>{children}</>;
  return (
    <section className="mvp-panel">
      <h2>Staff authentication</h2>
      <p>
        Platform access requires your authenticator. This verification lasts 15 minutes; sensitive
        actions also require recent account authentication.
      </p>
      {error && <Notice error>{error}</Notice>}
      {management && r.data.enrolled && (
        <>
          <p>
            To replace a lost authenticator, enter an unused recovery code below, then choose
            Replace authenticator. Recent account authentication is required.
          </p>
          <button
            className="button outline"
            disabled={busy || !otp}
            onClick={() =>
              void run(async () => {
                if (
                  await confirm({
                    title: "Replace staff authenticator?",
                    description:
                      "Your existing factor and recovery codes will be revoked, along with other sessions. Enroll a new authenticator before returning to administration.",
                    action: "REPLACE AUTHENTICATOR",
                  })
                ) {
                  await send("/account/staff-factor/reset", { otp });
                  setOtp("");
                  r.refresh();
                }
              })
            }
          >
            REPLACE AUTHENTICATOR
          </button>
        </>
      )}

      {!r.data.configured ? (
        <Notice>
          Staff authentication is unavailable until the operator configures its encryption key.
        </Notice>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await send("/auth/reauthenticate", { password });
                setPassword("");
              });
            }}
          >
            <Field label="Account password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="button outline" disabled={busy}>
              REAUTHENTICATE
            </button>
            <p>Google-only accounts: sign out and sign in with Google again, then return here.</p>
          </form>
          {!r.data.enrolled && !secret && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const v = await api<{ secret: string }>("/account/staff-factor/enroll", {
                    method: "POST",
                    body: "{}",
                  });
                  setSecret(v.secret);
                })
              }
            >
              SET UP AUTHENTICATOR
            </button>
          )}
          {secret && (
            <>
              <p>
                Add this setup key manually to your authenticator as a time-based, six-digit account
                named MatchFlow Staff. Never share this key.
              </p>
              <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
            </>
          )}
          {(r.data.enrolled || secret) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const v = await send<{ recoveryCodes?: string[] }>(
                    `/account/staff-factor/${secret ? "activate" : "verify"}`,
                    { otp },
                  );
                  setOtp("");
                  setSecret("");
                  if (v.recoveryCodes) setCodes(v.recoveryCodes);
                  r.refresh();
                });
              }}
            >
              <Field label="Authenticator or recovery code">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.trim())}
                  autoComplete="one-time-code"
                  maxLength={32}
                  required
                />
              </Field>
              <button className="button primary" disabled={busy}>
                VERIFY STAFF ACCESS
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
