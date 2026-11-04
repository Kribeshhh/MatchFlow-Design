import { Link } from "react-router-dom";
import { useResource } from "./api";
import { Notice, PageTitle } from "./UI";
export default function HelpPage() {
  const r = useResource<{ email: string | null }>("/support/contact");
  return (
    <>
      <PageTitle
        label="HELP / APPEALS"
        title="Contact support"
        description="Get help with your account or request a review of a moderation decision."
      />
      <section className="mvp-panel">
        <h2>Signed-in support</h2>
        <p>Submit a private case and follow its resolution in your account.</p>
        <Link className="button primary" to="/support">
          OPEN SUPPORT CENTER
        </Link>
        <h2>Unable to sign in?</h2>
        {r.error ? (
          <Notice error>{r.error}</Notice>
        ) : r.data?.email ? (
          <p>
            Contact{" "}
            <a className="text-button" href={`mailto:${r.data.email}`}>
              {r.data.email}
            </a>{" "}
            with your account username and case ID if available. Do not send passwords, recovery
            codes or payment details.
          </p>
        ) : (
          <p>
            The operator has not configured an external support contact yet. An external contact
            must be published before public launch.
          </p>
        )}
      </section>
    </>
  );
}
