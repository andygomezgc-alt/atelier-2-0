import * as SecureStore from "expo-secure-store";

export const TOKEN_KEY = "atelier.access_token.v1";
const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "network_unreachable") {
    super(message);
    this.name = "NetworkError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers, signal: abort.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new NetworkError("request_timeout");
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      message = json?.error ?? message;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}
