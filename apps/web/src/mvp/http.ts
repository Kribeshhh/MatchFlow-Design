import { validateResponse } from "../../../../packages/shared/src/responses.js";
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    signal,
    headers: { "Content-Type": "application/json", "X-MatchFlow": "1", ...options.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(
      502,
      "The API returned an invalid response. Check that the backend is running.",
    );
  }
  if (!response.ok)
    throw new RequestError(
      response.status,
      typeof data === "object" && data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed.",
    );
  try {
    return validateResponse(path, options.method || "GET", data) as T;
  } catch {
    throw new RequestError(502, "The API returned an unexpected response. Please try again.");
  }
}
