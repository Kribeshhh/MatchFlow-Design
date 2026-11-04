import { useState } from "react";
import { organizationProfileSchema } from "../../../../packages/shared/src/organizations";
import { Field, Notice } from "./UI";
import { send } from "./api";
export type OrganizationProfile = {
  id: string;
  name: string;
  description: string;
  region: string;
  website: string;
  publicProfile: boolean;
  logoId: string | null;
  version: number;
};
export function OrganizationProfileForm({
  organization,
  onDone,
}: {
  organization?: OrganizationProfile;
  onDone: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [version] = useState(organization?.version);
  return (
    <form
      className="mvp-form mvp-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const v = new FormData(e.currentTarget);
        try {
          const data = organizationProfileSchema.parse({
            name: v.get("name"),
            description: v.get("description"),
            region: v.get("region"),
            website: v.get("website"),
            publicProfile: v.get("publicProfile") === "on",
          });
          const result = await send<{ id: string }>(
            organization ? `/organizations/${organization.id}` : "/organizations",
            { ...data, ...(organization ? { expectedVersion: version } : {}) },
            organization ? "PATCH" : "POST",
          );
          onDone(result.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{organization ? "Organization settings" : "Create an organization"}</h2>
      {error && <Notice error>{error}</Notice>}
      <Field label="Organization name">
        <input
          name="name"
          required
          minLength={3}
          maxLength={100}
          defaultValue={organization?.name}
        />
      </Field>
      <Field label="About your organization">
        <textarea
          name="description"
          rows={4}
          maxLength={3000}
          defaultValue={organization?.description}
        />
      </Field>
      <div className="mvp-form-grid">
        <Field label="Organization region">
          <input name="region" maxLength={80} defaultValue={organization?.region} />
        </Field>
        <Field label="Organization website" hint="Optional HTTPS URL">
          <input name="website" type="url" maxLength={500} defaultValue={organization?.website} />
        </Field>
      </div>
      <label>
        <input type="checkbox" name="publicProfile" defaultChecked={organization?.publicProfile} />{" "}
        Publish organization profile and public tournament history
      </label>
      <p className="mvp-help">Private and draft tournaments never appear on your public profile.</p>
      <button className="button primary" disabled={busy}>
        {busy ? "SAVING…" : organization ? "SAVE ORGANIZATION" : "CREATE ORGANIZATION"}
      </button>
    </form>
  );
}
