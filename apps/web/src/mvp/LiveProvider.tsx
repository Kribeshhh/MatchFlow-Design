import { useEffect, useState } from "react";
import { useAuth } from "./Auth";
import { startLive, watchLiveStatus } from "./live";
export function LiveProvider() {
  const { user } = useAuth();
  useEffect(() => (user ? startLive(user.id) : undefined), [user?.id]);
  return null;
}
export function LiveStatus() {
  const [status, setStatus] = useState("Connecting to updates");
  useEffect(() => watchLiveStatus(setStatus), []);
  return (
    <span className="mvp-help mvp-live-status" role="status">
      {status}
    </span>
  );
}
