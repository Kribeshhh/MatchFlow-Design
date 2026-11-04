import StaffAuthentication from "./StaffAuthentication";
import { games } from "../data";
import { MediaUpload } from "./MediaUpload";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, send, useResource, type User } from "./api";
import { useAuth } from "./Auth";
import { Field, Loading, Notice, PageTitle, ResourceError } from "./UI";
type Session = { id: string; createdAt: string; expiresAt: string; current: boolean };
export default function AccountPage() {
  const auth = useAuth(),
    navigate = useNavigate();
  const profile = useResource<{ user: User; googleLinked: boolean }>("/account");
  const sessions = useResource<Session[]>("/account/sessions");
  const options = useResource<{ email: boolean; google: boolean }>("/auth/options");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leave(path: string) {
    await send(path);
    auth.setUser(null);
    navigate("/login");
  }
  if (profile.loading) return <Loading />;
  if (!profile.data) return <ResourceError message={profile.error} retry={profile.refresh} />;
  const { user, googleLinked } = profile.data;
  return (
    <>
      <PageTitle
        label="YOUR ACCOUNT"
        title="Account & security"
        description="One account for playing and organizing. Keep your profile and sign-in methods secure."
      />
      <p>
        <Link to="/support" className="text-button">
          SUPPORT & REPORTS ↗
        </Link>
      </p>
      <AccountExport />
      {user.platformRole !== "NONE" && <StaffAuthentication management />}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <section className="mvp-section mvp-panel">
        <h2>Email verification</h2>
        <p>
          {user.email} · {user.emailVerifiedAt ? "Verified" : "Not verified"}
        </p>
        {!user.emailVerifiedAt && (
          <>
            {!options.data?.email && <p>Email delivery has not been configured yet.</p>}
            <button
              className="button outline"
              disabled={busy || !options.data?.email}
              onClick={() =>
                void run(async () => {
                  await send("/auth/verification");
                  setMessage("Verification requested. Check your inbox.");
                })
              }
            >
              SEND VERIFICATION EMAIL
            </button>
          </>
        )}
      </section>
      <MediaUpload
        path="/account/avatar"
        label="Profile avatar"
        current={user.avatarId ? `/api/media/${user.avatarId}` : null}
        onChange={profile.refresh}
      />
      <form
        className="mvp-section mvp-panel mvp-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const data = {
            ...Object.fromEntries(form),
            gamesPlayed: form.getAll("gamesPlayed"),
            socialLinks: String(form.get("socialLinks") || "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            profilePublic: form.has("profilePublic"),
            showHistory: form.has("showHistory"),
            showTeams: form.has("showTeams"),
          };
          void run(async () => {
            const result = await send<{ user: User }>("/account", data, "PATCH");
            auth.setUser(result.user);
            profile.refresh();
            setMessage("Profile saved.");
          });
        }}
      >
        <h2>Profile</h2>
        <Link to={`/players/${user.username}`}>View player profile</Link>
        <Field label="Username">
          <input
            name="username"
            defaultValue={user.username}
            minLength={3}
            maxLength={24}
            pattern="[a-zA-Z0-9_]+"
            required
          />
        </Field>
        <Field label="Region">
          <input name="region" defaultValue={user.region || ""} maxLength={80} />
        </Field>
        <fieldset>
          <legend>Games played</legend>
          {games.map((g) => (
            <label className="mvp-check" key={g.id}>
              <input
                type="checkbox"
                name="gamesPlayed"
                value={g.id}
                defaultChecked={user.gamesPlayed?.includes(g.id)}
              />
              {g.name}
            </label>
          ))}
        </fieldset>
        <Field
          label="Public social links"
          hint="Up to five HTTPS links, one per line. Links are visible when your profile is public."
        >
          <textarea name="socialLinks" defaultValue={user.socialLinks?.join("\n") || ""} rows={3} />
        </Field>
        <fieldset>
          <legend>Profile privacy</legend>
          <label className="mvp-check">
            <input type="checkbox" name="profilePublic" defaultChecked={user.profilePublic} />
            Public player profile
          </label>
          <label className="mvp-check">
            <input type="checkbox" name="showHistory" defaultChecked={user.showHistory} />
            Show tournament history and statistics
          </label>
          <label className="mvp-check">
            <input type="checkbox" name="showTeams" defaultChecked={user.showTeams} />
            Show team memberships
          </label>
          <p>
            Privacy controls apply to your profile. Published tournament rosters and results remain
            visible.
          </p>
        </fieldset>
        <Field label="Display name">
          <input name="displayName" defaultValue={user.displayName || ""} maxLength={80} />
        </Field>
        <Field label="Bio">
          <textarea name="bio" defaultValue={user.bio || ""} maxLength={500} />
        </Field>
        <Field
          label="Default dashboard"
          hint="This changes your workspace view, not your permissions. You can play and organize."
        >
          <select name="role" defaultValue={user.role}>
            <option value="PLAYER">Player</option>
            <option value="ORGANIZER">Organizer</option>
          </select>
        </Field>
        <button className="button primary" disabled={busy}>
          SAVE PROFILE
        </button>
        <Link to="/organizer/tournaments/new">Create a tournament</Link>
        <Link to="/teams">Manage your teams</Link>
      </form>
      <form
        className="mvp-section mvp-panel mvp-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const password = new FormData(form).get("password");
          void run(async () => {
            await send("/auth/reauthenticate", { password });
            form.reset();
            setMessage("Identity confirmed for five minutes.");
          });
        }}
      >
        <h2>Confirm your identity</h2>
        <p>
          Sensitive actions require a recent sign-in or password confirmation. For a Google-only
          account, sign out and sign in with Google again.
        </p>
        <Field label="Current password">
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
          />
        </Field>
        <button className="button outline" disabled={busy}>
          CONFIRM IDENTITY
        </button>
      </form>
      <form
        className="mvp-section mvp-panel mvp-form"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          if (!values.currentPassword) delete values.currentPassword;
          void run(async () => {
            await send("/account/password", values);
            auth.setUser(null);
            navigate("/login");
          });
        }}
      >
        <h2>Change password</h2>
        <p>
          Changing your password signs out every device. Google-only accounts may set their first
          password after a recent Google sign-in.
        </p>
        <Field label="Current password (if set)">
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            maxLength={128}
          />
        </Field>
        <Field label="New password">
          <input
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <button className="button primary" disabled={busy}>
          SAVE PASSWORD & SIGN OUT
        </button>
      </form>
      <section className="mvp-section mvp-panel">
        <h2>Google sign-in</h2>
        <p>
          {googleLinked
            ? "Google is linked to your account."
            : options.data?.google
              ? "Link your Google identity after verifying your email and confirming your identity."
              : "Google sign-in has not been configured yet."}
        </p>
        {googleLinked ? (
          <button
            className="button outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/account/google", { method: "DELETE" });
                auth.setUser(null);
                navigate("/login");
              })
            }
          >
            UNLINK GOOGLE & SIGN OUT
          </button>
        ) : (
          <button
            className="button outline"
            disabled={busy || !options.data?.google || !user.emailVerifiedAt}
            onClick={() =>
              void run(async () => {
                const result = await send<{ url: string }>("/account/google/link");
                window.location.assign(result.url);
              })
            }
          >
            LINK GOOGLE
          </button>
        )}
      </section>
      <section className="mvp-section mvp-panel">
        <h2>Active sessions</h2>
        {sessions.error && <Notice error>{sessions.error}</Notice>}
        {sessions.data?.map((session) => (
          <div key={session.id} className="mvp-section">
            <p>
              {session.current ? "This device" : "Other session"} · Signed in{" "}
              {new Date(session.createdAt).toLocaleString()} · Expires{" "}
              {new Date(session.expiresAt).toLocaleString()}
            </p>
            {!session.current && (
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`/account/sessions/${session.id}`, { method: "DELETE" });
                    sessions.refresh();
                  })
                }
              >
                SIGN OUT SESSION
              </button>
            )}
          </div>
        ))}
        <button
          className="button outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await send("/account/sessions/revoke-others");
              sessions.refresh();
              setMessage("Other sessions signed out.");
            })
          }
        >
          SIGN OUT OTHER DEVICES
        </button>
      </section>
      <form
        className="mvp-section mvp-panel mvp-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => leave("/account/deactivate"));
        }}
      >
        <h2>Deactivate account</h2>
        <p>
          This blocks sign-in and revokes your sessions. You can request an email link to
          reactivate. Transfer captain ownership first if your teammates need continued captain
          management.
        </p>
        <label>
          <input type="checkbox" required /> I understand my account will be deactivated.
        </label>
        <button className="button outline" disabled={busy}>
          DEACTIVATE ACCOUNT
        </button>
      </form>
      <form
        className="mvp-section mvp-panel mvp-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => leave("/account/deletion"));
        }}
      >
        <h2>Delete account</h2>
        <p>
          This permanently anonymizes your account and saved roster names, removes sign-in methods,
          and signs out every device. Tournament history remains. You will lose access to teams and
          events you manage; this cannot be undone. Transfer captain ownership from My teams before
          deleting your account.
        </p>
        <label>
          <input type="checkbox" required /> I understand that deletion is permanent and tournament
          history is retained.
        </label>
        <button className="button outline" disabled={busy}>
          DELETE & ANONYMIZE ACCOUNT
        </button>
      </form>
    </>
  );
}

function AccountExport() {
  const [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <section className="mvp-panel">
      <h2>Your data export</h2>
      <p>
        Download your profile, memberships, participation identifiers and submitted reports. Large
        exports are split into numbered JSON files. Recent authentication is required.
      </p>
      {error && <Notice error>{error}</Notice>}
      {done ? (
        <Notice>All export pages downloaded.</Notice>
      ) : (
        <button
          className="button outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const data = await api<{ nextPage: number | null }>(`/account/export?page=${page}`),
                url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                ),
                link = document.createElement("a");
              link.href = url;
              link.download = `matchflow-account-${page}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              if (data.nextPage) setPage(data.nextPage);
              else setDone(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          DOWNLOAD EXPORT PAGE {page}
        </button>
      )}
    </section>
  );
}
