import { Link } from "react-router-dom";
export function ReportLink({
  type,
  id,
}: {
  type: "USER" | "TEAM" | "TOURNAMENT" | "ORGANIZATION";
  id: string;
}) {
  return (
    <p>
      <Link className="text-button" to={`/support?type=${type}&id=${encodeURIComponent(id)}`}>
        REPORT {type} ↗
      </Link>
    </p>
  );
}
