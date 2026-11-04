import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { loginSchema, registerSchema } from "../../../../packages/shared/src/validation";
import { Mark } from "../Art";
import { send, useResource, type User } from "./api";
import { useAuth } from "./Auth";
import { Field, Notice } from "./UI";
export default function AuthPage({ register = false }: { register?: boolean }) {
  const auth = useAuth();
  const options = useResource<{ email: boolean; google: boolean }>("/auth/options");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextParam = params.get("next");
  const next =
    nextParam?.startsWith("/") && !nextParam.startsWith("//") && !nextParam.includes("\\")
      ? nextParam
      : "/dashboard";
  const [role, setRole] = useState<"PLAYER" | "ORGANIZER">(
    next.includes("/organizer") || params.get("role") === "ORGANIZER" ? "ORGANIZER" : "PLAYER",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (auth.user && params.get("oauth") !== "failed")
    return <Navigate to={register ? "/account" : next} replace />;
  return (
    <div className="mvp-auth">
      <div className="mvp-auth-intro">
        <Mark />
        <span className="eyebrow">ONE CONTROL ROOM. EVERY TOURNAMENT.</span>
        <h1>{register ? "Your next chapter starts here." : "Back in the game."}</h1>
        <p>
          {register
            ? "Create your account. Build your team or bring your next tournament to life."
            : "Your teams, schedules, and tournament moments are waiting."}
        </p>
        <div className="mvp-auth-line" />
      </div>
      <form
        className="mvp-panel mvp-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const values = Object.fromEntries(new FormData(e.currentTarget));
          delete values.accountType;
          try {
            const input = register
              ? registerSchema.parse({ ...values, role })
              : loginSchema.parse(values);
            const result = await send<{ user: User }>(
              `/auth/${register ? "register" : "login"}`,
              input,
            );
            auth.setUser(result.user);
            navigate(register ? "/account" : next, { replace: true });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to sign in.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">{register ? "CREATE AN ACCOUNT" : "WELCOME BACK"}</span>
        <h2>{register ? "Get started" : "Log in"}</h2>
        <p>
          <Link to="/help" className="text-button">
            ACCOUNT SUPPORT & APPEALS ↗
          </Link>
        </p>
        {error && <Notice error>{error}</Notice>}
        {params.get("oauth") === "failed" && (
          <Notice error>
            Google sign-in could not be completed. If you already have an account, sign in with your
            existing method and link Google in account settings.
          </Notice>
        )}
        {register && (
          <>
            <Field label="Username">
              <input
                name="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="username"
                placeholder="your_player_name"
              />
            </Field>
            <fieldset className="mvp-role-picker">
              <legend>Start in this workspace — you can use both</legend>
              {(["PLAYER", "ORGANIZER"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="accountType"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  <span>
                    {value === "PLAYER" ? "Player" : "Organizer"}
                    <small>
                      {value === "PLAYER" ? "Build a team. Compete." : "Host. Manage. Crown."}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
          />
        </Field>
        <Field
          label="Password"
          hint={register ? "At least 12 characters. Use a unique password." : undefined}
        >
          <input
            name="password"
            type="password"
            required
            minLength={register ? 12 : 1}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </Field>
        <button className="button primary full" disabled={busy}>
          {busy ? "PLEASE WAIT…" : register ? "CREATE ACCOUNT" : "LOG IN"}
          <ArrowUpRight size={16} />
        </button>
        {options.data?.google && (
          <button
            type="button"
            className="button outline full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await send<{ url: string }>("/auth/google/start");
                window.location.assign(result.url);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            CONTINUE WITH GOOGLE
          </button>
        )}
        {!register && (
          <p>
            <Link to="/forgot-password">Forgot password?</Link> ·{" "}
            <Link to="/reactivation">Reactivate account</Link>
          </p>
        )}
        <p>
          {register ? "Already have an account?" : "New to MatchFlow?"}{" "}
          <Link to={`${register ? "/login" : "/register"}?next=${encodeURIComponent(next)}`}>
            {register ? "Log in" : "Create an account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
