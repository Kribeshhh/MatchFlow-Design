import { useState } from "react";
import { Link } from "react-router-dom";
import type { Workspace } from "../../../../packages/shared/src/organizations";
import type { PortalInput } from "../../../../packages/shared/src/portals";
import { useResource, send, date } from "./api";
import { Field, Loading, Notice, ResourceError } from "./UI";
import { MediaUpload } from "./MediaUpload";
import { useConfirm } from "./DesignSystem";
type Settings = Omit<PortalInput, "expectedVersion"> & { version: number; coverId: string | null };
export function PortalSettings({ workspace: w }: { workspace: Workspace }) {
  const root = `/organizations/${w.id}/portal`,
    r = useResource<{ portal: Settings | null; canHideAttribution: boolean }>(root),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const confirm = useConfirm();
  if (r.error) return <ResourceError message={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <Loading />;
  const p = r.data.portal;
  return (
    <div className="portal-settings mvp-section">
      <h2>Your tournament portal</h2>
      <p>
        Publish a branded home for your organization’s public tournaments. Private events and
        account actions remain on MatchFlow.
      </p>
      {error && <Notice error>{error}</Notice>}
      {saved && <Notice>Portal settings saved.</Notice>}
      {p?.enabled && (
        <Link className="button outline" to={`/portals/${p.slug}`}>
          VIEW PUBLIC PORTAL ↗
        </Link>
      )}
      <form
        key={`${p?.version ?? "new"}`}
        className="mvp-panel mvp-form mvp-section"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            f.get("enabled") &&
            !p?.enabled &&
            !(await confirm({
              title: "Publish organization portal?",
              description:
                "Your branding and this organization’s published public tournaments will be accessible without signing in.",
              action: "PUBLISH PORTAL",
            }))
          )
            return;
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            await send(
              root,
              {
                slug: f.get("slug"),
                title: f.get("title"),
                intro: f.get("intro"),
                accent: f.get("accent"),
                enabled: f.get("enabled") === "on",
                hideAttribution: f.get("hide") === "on",
                navigation: (["HOME", "TOURNAMENTS", "RESULTS"] as const)
                  .filter((t) => f.get(`nav_${t}`) === "on")
                  .map((target) => ({ target, label: String(f.get(`label_${target}`)) })),
                ...(p ? { expectedVersion: p.version } : {}),
              },
              "PUT",
            );
            setSaved(true);
            r.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Portal address slug"
          hint="4–50 lowercase letters, numbers and hyphens. The address is permanent after creation."
        >
          <input
            name="slug"
            defaultValue={p?.slug}
            readOnly={Boolean(p)}
            required
            minLength={4}
            maxLength={50}
            pattern="[a-z0-9][a-z0-9-]{2,48}[a-z0-9]"
          />
        </Field>
        <Field label="Portal headline">
          <input
            name="title"
            defaultValue={p?.title || w.name}
            required
            minLength={2}
            maxLength={100}
          />
        </Field>
        <Field label="Portal introduction">
          <textarea name="intro" defaultValue={p?.intro || w.description} maxLength={1200} />
        </Field>
        <Field
          label="Portal accent color"
          hint="Use a light hex color with readable contrast on charcoal."
        >
          <input
            name="accent"
            defaultValue={p?.accent || "#D3F45D"}
            required
            pattern="#[A-Fa-f0-9]{6}"
            maxLength={7}
          />
        </Field>
        <fieldset>
          <legend>Approved navigation</legend>
          {(["HOME", "TOURNAMENTS", "RESULTS"] as const).map((t) => (
            <div key={t}>
              <label>
                <input
                  type="checkbox"
                  name={`nav_${t}`}
                  defaultChecked={p ? p.navigation.some((n) => n.target === t) : true}
                />
                {t}
              </label>
              <Field label={`${t} navigation label`}>
                <input
                  name={`label_${t}`}
                  defaultValue={
                    p?.navigation.find((n) => n.target === t)?.label ||
                    { HOME: "Home", TOURNAMENTS: "Tournaments", RESULTS: "Results" }[t]
                  }
                  required
                  maxLength={24}
                />
              </Field>
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>Publication</legend>
          <label>
            <input type="checkbox" name="enabled" defaultChecked={p?.enabled} />
            Publish portal
          </label>
          {r.data.canHideAttribution ? (
            <label>
              <input type="checkbox" name="hide" defaultChecked={p?.hideAttribution} />
              Hide Powered by MatchFlow
            </label>
          ) : (
            <p>Powered by MatchFlow remains visible under platform policy.</p>
          )}
        </fieldset>
        <button className="button primary" disabled={busy}>
          SAVE PORTAL
        </button>
      </form>
      <MediaUpload
        path={`/organizations/${w.id}/logo`}
        label="Organization logo"
        current={w.logoId ? `/api/media/${w.logoId}` : null}
        onChange={r.refresh}
      />
      {p && (
        <MediaUpload
          path={`${root}/cover`}
          label="Portal cover"
          current={p.coverId ? `/api/media/${p.coverId}` : null}
          onChange={r.refresh}
        />
      )}
      {w.access === "OWNER" && p && <DomainSettings org={w.id} />}
    </div>
  );
}
type Domain = {
  id: string;
  hostname: string;
  status: string;
  challenge: string;
  challengeExpiresAt: string;
  certificateStatus: string;
  providerStatus: string;
  checkedAt: string | null;
  removedAt: string | null;
  dnsRecords: { name: string; type: string; value: string }[];
};
function DomainSettings({ org }: { org: string }) {
  const root = `/organizations/${org}/domains`,
    r = useResource<{
      configured: boolean;
      cnameTarget: string | null;
      apexAddresses: string[];
      domains: Domain[];
    }>(root),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  async function act(path: string, body: object = {}, method = "POST", title?: string) {
    if (
      title &&
      !(await confirm({
        title,
        description:
          "Routing will stop immediately. Removal keeps the hostname reserved until managed-provider cleanup is confirmed. A fresh DNS challenge is required to connect it again.",
        action: "CONFIRM",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await send(path, body, method);
      r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mvp-section">
      <h2>Custom domains</h2>
      <p>
        Only the organization owner can connect domains. Keep the verification TXT record in place;
        ongoing checks protect domain ownership.
      </p>
      {error && <Notice error>{error}</Notice>}
      {r.error && <ResourceError message={r.error} retry={r.refresh} />}
      {r.data && !r.data.configured && (
        <Notice>
          Cloudflare hosting is not configured yet. You can reserve a hostname and prepare its
          ownership TXT record; TLS activation remains unavailable until the platform operator
          connects Cloudflare.
        </Notice>
      )}
      <form
        className="mvp-form mvp-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void act(root, { hostname: new FormData(e.currentTarget).get("hostname") });
        }}
      >
        <Field
          label="Custom hostname"
          hint="A domain or subdomain you control, without https:// or a path."
        >
          <input name="hostname" placeholder="play.your-community.org" required maxLength={253} />
        </Field>
        <button className="button primary" disabled={busy}>
          CONNECT DOMAIN
        </button>
      </form>
      {r.data?.domains.map((d) => (
        <article key={d.id} className="mvp-panel mvp-section portal-domain">
          <h3>{d.hostname}</h3>
          <p>
            Routing: {d.status} · TLS: {d.certificateStatus} · Provider: {d.providerStatus}
          </p>
          {d.checkedAt && <p>Last checked {date(d.checkedAt)}</p>}
          {!d.removedAt && (
            <>
              <h4>1. Prove ownership</h4>
              <p>
                TXT name: <code>_matchflow-challenge.{d.hostname}</code>
              </p>
              <p>
                TXT value: <code>{d.challenge}</code>
              </p>
              <p>Initial verification deadline: {date(d.challengeExpiresAt)}</p>
              <h4>2. Route traffic</h4>
              <p>
                CNAME {d.hostname} →{" "}
                <code>{r.data?.cnameTarget || "Awaiting platform configuration"}</code>
              </p>
              {Boolean(r.data?.apexAddresses.length) && (
                <p>
                  For a flattened apex, use provider-assigned addresses:{" "}
                  {r.data?.apexAddresses.join(", ")}
                </p>
              )}
              <h4>3. Managed certificate validation</h4>
              {d.dnsRecords.length ? (
                d.dnsRecords.map((record, i) => (
                  <p key={i}>
                    {record.type} <code>{record.name}</code> → <code>{record.value}</code>
                  </p>
                ))
              ) : (
                <p>Provider validation records appear after ownership and routing verification.</p>
              )}
              <div className="mvp-action-row">
                <button
                  className="button primary"
                  disabled={busy || !r.data?.configured || d.status === "REMOVING"}
                  onClick={() => void act(`${root}/${d.id}/check`)}
                >
                  CHECK DNS AND TLS
                </button>
                <button
                  className="button outline"
                  disabled={busy || d.status === "REMOVING"}
                  onClick={() =>
                    void act(
                      `${root}/${d.id}/challenge`,
                      {},
                      "POST",
                      "Rotate verification challenge?",
                    )
                  }
                >
                  NEW CHALLENGE
                </button>
                <button
                  className="button outline"
                  disabled={busy || d.status === "REMOVING"}
                  onClick={() => void act(`${root}/${d.id}`, {}, "DELETE", "Remove custom domain?")}
                >
                  REMOVE DOMAIN
                </button>
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
