import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import {
  notificationKind,
  type NotificationList,
  type NotificationPreferences,
} from "../../../../packages/shared/src/notifications";
import { date, send, useResource } from "./api";
import { Empty, Loading, Notice, PageTitle, ResourceError } from "./UI";
import { LiveStatus } from "./LiveProvider";
export function NotificationBadge() {
  const r = useResource<NotificationList>("/notifications");
  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${r.data?.unread ? `, ${r.data.unread} unread` : ""}`}
    >
      <Bell size={18} />
      {Boolean(r.data?.unread) && (
        <span className="mvp-notification-count">
          {r.data!.unread > 99 ? "99+" : r.data!.unread}
        </span>
      )}
    </Link>
  );
}
export function NotificationCenter() {
  const [cursor, setCursor] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const r = useResource<NotificationList>(
      `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
    p = useResource<NotificationPreferences>("/notifications/preferences");
  async function act(path: string, body: unknown = {}, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await send(path, body, method);
      r.refresh();
      p.refresh();
      setNotice("Notification settings updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        label="YOUR INBOX"
        title="Stay in the loop"
        description="Tournament updates, match confirmations and reminders in one place."
      />
      <LiveStatus />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {r.data && !r.data.emailAvailable && (
        <Notice>
          Email delivery is not configured. In-app updates are available; tournament emails await
          SMTP configuration.
        </Notice>
      )}
      <details className="mvp-panel mvp-section">
        <summary>Notification preferences</summary>
        {p.error ? (
          <ResourceError message={p.error} retry={p.refresh} />
        ) : p.data ? (
          <form
            className="mvp-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget);
              void act(
                "/notifications/preferences",
                {
                  inApp: v.get("inApp") === "on",
                  email: v.get("email") === "on",
                  mutedKinds: notificationKind.options.filter((kind) => v.get(kind) !== "on"),
                },
                "PUT",
              );
            }}
          >
            <label>
              <input name="inApp" type="checkbox" defaultChecked={p.data.inApp} /> In-app tournament
              notifications
            </label>
            <label>
              <input name="email" type="checkbox" defaultChecked={p.data.email} /> Important
              tournament emails
            </label>
            <p>
              These choices apply to future updates. Disabling email also stops unsent tournament
              emails. Verification and recovery emails are separate.
            </p>
            <fieldset>
              <legend>Notification categories</legend>
              {notificationKind.options.map((kind) => (
                <label className="mvp-notification-option" key={kind}>
                  <input
                    name={kind}
                    type="checkbox"
                    defaultChecked={!p.data!.mutedKinds.includes(kind)}
                  />
                  {kind.replaceAll("_", " ").toLowerCase()}
                </label>
              ))}
            </fieldset>
            <button className="button primary" disabled={busy}>
              SAVE PREFERENCES
            </button>
          </form>
        ) : (
          <Loading />
        )}
      </details>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ResourceError message={r.error} retry={r.refresh} />
      ) : (
        r.data && (
          <>
            <div className="mvp-section-title">
              <h2>{r.data.unread} unread</h2>
              <button
                className="button outline"
                disabled={busy || !r.data.unread}
                onClick={() => void act("/notifications/read-all")}
              >
                MARK ALL READ
              </button>
            </div>
            {!r.data.items.length && (
              <Empty title="You’re all caught up">
                <p>Updates for your tournament entries and managed events will appear here.</p>
              </Empty>
            )}
            <div className="mvp-stack">
              {r.data.items.map((n) => (
                <article
                  className={`mvp-panel mvp-notification ${n.readAt ? "" : "is-unread"}`}
                  key={n.id}
                >
                  <span className="eyebrow">
                    {date(n.createdAt)} {n.readAt ? "" : "· UNREAD"}
                  </span>
                  <h3>{n.title}</h3>
                  <p>
                    {n.tournamentName} · {n.detail}
                  </p>
                  <div className="mvp-action-row">
                    <Link className="mvp-small-link" to={`/tournaments/${n.tournamentId}`}>
                      OPEN TOURNAMENT ↗
                    </Link>
                    {!n.readAt && (
                      <button
                        className="mvp-small-button"
                        disabled={busy}
                        onClick={() => void act(`/notifications/${n.id}/read`)}
                        aria-label={`Mark ${n.title} for ${n.tournamentName} as read`}
                      >
                        MARK READ
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="mvp-action-row">
              {cursor && (
                <button className="button outline" onClick={() => setCursor("")}>
                  LATEST UPDATES
                </button>
              )}
              {r.data.nextCursor && (
                <button className="button outline" onClick={() => setCursor(r.data!.nextCursor!)}>
                  OLDER UPDATES
                </button>
              )}
            </div>
          </>
        )
      )}
    </>
  );
}
