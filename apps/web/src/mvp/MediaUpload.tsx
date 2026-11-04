import { useState } from "react";
import { api, send, useResource } from "./api";
import { Field, Notice } from "./UI";
export function MediaUpload({
  path,
  label,
  current,
  onChange,
}: {
  path: string;
  label: string;
  current?: string | null;
  onChange: () => void;
}) {
  const options = useResource<{ available: boolean }>("/media/options");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="mvp-panel mvp-section">
      <h2>{label}</h2>
      {current && <img src={current} alt={label} width={96} height={96} />}
      {error && <Notice error>{error}</Notice>}
      {options.error ? (
        <Notice error>{options.error}</Notice>
      ) : (
        !options.loading &&
        !options.data?.available && <p>Uploads are unavailable until S3 storage is configured.</p>
      )}
      <form
        className="mvp-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("image");
          if (!(file instanceof File) || !file.size) return;
          if (file.size > 2 * 1024 * 1024) {
            setError("Choose an image up to 2 MB.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api(path, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: file,
            });
            onChange();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label={`Choose ${label.toLowerCase()}`}
          hint="PNG, JPEG or WebP. Up to 2 MB and 16 megapixels; animated images are not supported."
        >
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            required
            disabled={busy || !options.data?.available}
          />
        </Field>
        <button className="button primary" disabled={busy || !options.data?.available}>
          {busy ? "UPLOADING…" : "UPLOAD IMAGE"}
        </button>
      </form>
      {current && (
        <button
          className="button outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await send(path, {}, "DELETE");
              onChange();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          REMOVE IMAGE
        </button>
      )}
    </section>
  );
}
