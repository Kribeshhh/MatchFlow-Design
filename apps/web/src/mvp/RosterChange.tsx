import { useState } from "react";
import { send, type Event, type Registration } from "./api";
import { useConfirm } from "./DesignSystem";
import { Notice } from "./UI";
export function RosterChange({
  event,
  entry,
  manager,
  onChange,
}: {
  event: Event;
  entry: Registration;
  manager: boolean;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const open =
    ["REGISTRATION", "PUBLISHED"].includes(event.phase) &&
    event.competitionType === "TEAM" &&
    new Date(event.closesAt) > new Date() &&
    ["PENDING", "APPROVED"].includes(entry.status);
  async function act(approve?: boolean) {
    if (
      !(await confirm({
        title:
          approve === undefined
            ? "Request roster replacement?"
            : approve
              ? "Approve roster replacement?"
              : "Reject roster replacement?",
        description:
          approve === undefined
            ? "Your current starting team will be proposed. The saved tournament roster stays unchanged until the organizer approves before registration closes."
            : "This affects only this tournament entry. Approval rechecks current membership and duplicate players.",
        action:
          approve === undefined ? "REQUEST CHANGE" : approve ? "APPROVE CHANGE" : "REJECT CHANGE",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await send(
        `/tournaments/${event.id}/registrations/${entry.id}/roster`,
        approve === undefined ? {} : { approve },
        approve === undefined ? "POST" : "PATCH",
      );
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mvp-section">
      <p>
        Saved tournament roster: {entry.roster.map((p) => p.username).join(", ")}. Team changes do
        not edit this snapshot.
      </p>
      {error && <Notice error>{error}</Notice>}
      {entry.proposedRoster && (
        <p>
          Proposed roster: {entry.proposedRoster.map((p) => p.username).join(", ")}
          {open ? " · Awaiting organizer review" : " · Deadline passed; saved roster retained"}
        </p>
      )}
      {open && entry.canManageRoster && (
        <button className="mvp-small-button" disabled={busy} onClick={() => void act()}>
          REQUEST ROSTER CHANGE
        </button>
      )}
      {open && manager && entry.proposedRoster && (
        <div className="mvp-action-row">
          <button className="mvp-small-button" disabled={busy} onClick={() => void act(true)}>
            APPROVE ROSTER CHANGE
          </button>
          <button className="mvp-small-button" disabled={busy} onClick={() => void act(false)}>
            REJECT ROSTER CHANGE
          </button>
        </div>
      )}
    </div>
  );
}
