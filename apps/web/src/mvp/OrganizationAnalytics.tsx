import { useState } from "react";
import { Link } from "react-router-dom";
import type { OrganizationAnalytics as Analytics } from "../../../../packages/shared/src/organizations";
import { useResource, date, gameName } from "./api";
import { Field, Loading, ResourceError, Empty, Status } from "./UI";
import { DataTable } from "./DesignSystem";
const percent = (n: number | null) =>
  n === null ? "No eligible data" : `${(n * 100).toFixed(1)}%`;
export function OrganizationAnalytics({ id }: { id: string }) {
  const [days, setDays] = useState(90);
  const r = useResource<Analytics>(`/organizations/${id}/analytics?days=${days}`);
  return (
    <>
      <div className="mvp-action-row mvp-section">
        <Field label="Analytics period">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </Field>
        <a
          className="button outline"
          href={`/api/organizations/${id}/export.csv?days=${days}`}
          download
        >
          EXPORT ANALYTICS CSV
        </a>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error || !r.data ? (
        <ResourceError message={r.error || "Analytics unavailable."} retry={r.refresh} />
      ) : (
        <AnalyticsContent data={r.data} />
      )}
    </>
  );
}
function AnalyticsContent({ data: d }: { data: Analytics }) {
  const metrics = [
    ["Total tournaments", d.totals.tournaments],
    ["Active tournaments", d.totals.active],
    ["Registrations", d.totals.registrations],
    ["Participating teams", d.totals.participatingTeams],
    ["Pending approvals", d.totals.pendingApprovals],
    ["Completed tournaments", d.totals.completed],
  ];
  return (
    <>
      <h2>Workspace overview</h2>
      <p className="mvp-help">
        Lifetime totals. Participating teams counts distinct reusable teams with an approved entry;
        registrations includes all current statuses.
      </p>
      <div className="mvp-organization-metrics">
        {metrics.map(([label, value]) => (
          <div className="mvp-panel" key={label}>
            <span className="eyebrow">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="mvp-form-grid mvp-section">
        <section className="mvp-panel">
          <h3>Approval conversion</h3>
          <strong className="mvp-organization-rate">{percent(d.conversion.rate)}</strong>
          <p>
            {d.conversion.approved} approved / {d.conversion.submitted} entries submitted in the
            last {d.days} days.
          </p>
          <p className="mvp-help">
            Current approval status, not visitor conversion. Visitor tracking is unavailable.
          </p>
        </section>
        <section className="mvp-panel">
          <h3>Check-in rate</h3>
          <strong className="mvp-organization-rate">{percent(d.attendance.rate)}</strong>
          <p>
            {d.attendance.checkedIn} checked in / {d.attendance.eligible} approved entries requiring
            check-in, submitted in this period.
          </p>
          <p className="mvp-help">Upcoming check-ins may still be outstanding.</p>
        </section>
      </div>
      <section className="mvp-panel mvp-section">
        <h2>Registrations over time</h2>
        <p>
          Daily submissions in UTC · last {d.days} days. Days without submissions have zero
          registrations.
        </p>
        {!d.daily.length ? (
          <p>No submissions in this period.</p>
        ) : (
          <div className="mvp-registration-chart" aria-label="Daily registration counts">
            {d.daily.map((row) => (
              <div key={row.day}>
                <span>{row.day}</span>
                <meter
                  min={0}
                  max={Math.max(1, ...d.daily.map((r) => r.registrations))}
                  value={row.registrations}
                  aria-label={`${row.day}: ${row.registrations} registrations`}
                />
                <strong>{row.registrations}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <DataTable
        caption={`Game popularity · events created in the last ${d.days} days`}
        headings={["Game", "Tournaments", "Registrations"]}
      >
        {d.games.map((g) => (
          <tr key={g.game}>
            <td>{gameName(g.game)}</td>
            <td>{g.tournaments}</td>
            <td>{g.registrations}</td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        caption={`Team participation · top 20 by approved entries submitted in the last ${d.days} days`}
        headings={["Team", "This period", "Previous period", "Change"]}
      >
        {d.teamTrends.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.entries}</td>
            <td>{t.previous}</td>
            <td>{t.entries - t.previous}</td>
          </tr>
        ))}
      </DataTable>
      <h2 className="mvp-section">Upcoming matches</h2>
      {!d.upcoming.length && (
        <Empty title="Nothing scheduled">
          <p>Scheduled matches will appear here.</p>
        </Empty>
      )}
      {d.upcoming.map((m) => (
        <Link
          className="mvp-panel mvp-org-match"
          key={m.id}
          to={`/organizer/tournaments/${m.tournamentId}?tab=Matches`}
        >
          <strong>{m.label || `${m.teamA?.name || "TBD"} vs ${m.teamB?.name || "TBD"}`}</strong>
          <span>
            {m.tournament.name} · {date(m.scheduledAt)}
          </span>
        </Link>
      ))}
      <DataTable
        caption="Tournament history and progress · latest 100 events"
        headings={["Tournament", "State", "Entries", "Progress"]}
      >
        {d.tournaments.map((t) => (
          <tr key={t.id}>
            <td>
              <Link className="text-button" to={`/organizer/tournaments/${t.id}`}>
                {t.name}
              </Link>
              <small>{date(t.startsAt)}</small>
            </td>
            <td>
              <Status value={t.phase} />
            </td>
            <td>{t.registrations}</td>
            <td>
              {t.completed} / {t.scheduled} generated matches or rounds
              {t.scheduled > 0 && (
                <progress
                  aria-label={`${t.name} completion`}
                  value={t.completed}
                  max={t.scheduled}
                />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <p className="mvp-help">
        BYEs are excluded. Progress counts generated matches/lobby rounds; future Swiss/playoff
        rounds are added when qualified.
      </p>
      <DataTable
        caption="Recent organizer activity · latest 30 audited actions"
        headings={["Action", "Time"]}
      >
        {d.activity.map((a) => (
          <tr key={a.id}>
            <td>{a.action.replaceAll(".", " ")}</td>
            <td>{date(a.createdAt)}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
