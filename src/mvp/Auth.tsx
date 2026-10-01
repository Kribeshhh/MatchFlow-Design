import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, send, type User } from "./api";
const Context = createContext<{
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setUser((await api<{ user: User | null }>("/auth/me")).user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function logout() {
    await send("/auth/logout");
    setUser(null);
  }
  return (
    <Context.Provider
      value={{ user, loading, error, refresh, setUser, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
export function Protected({
  children,
  role,
}: {
  children: ReactNode;
  role?: User["role"];
}) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading)
    return <div className="mvp-state">Checking your session…</div>;
  if (auth.error)
    return (
      <div className="mvp-state">
        <p role="alert">{auth.error}</p>
        <button className="button outline" onClick={() => void auth.refresh()}>
          RETRY CONNECTION
        </button>
      </div>
    );
  if (!auth.user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  if (role && auth.user.role !== role)
    return (
      <div className="mvp-state">
        <h1>
          {role === "ORGANIZER"
            ? "Organizer account required"
            : "Player account required"}
        </h1>
        <p>
          Your current account is a {auth.user.role.toLowerCase()}. Use the
          account switch in the header to log out and choose the appropriate
          account.
        </p>
        <a className="button primary" href="/dashboard">
          YOUR DASHBOARD
        </a>
      </div>
    );
  return children;
}
