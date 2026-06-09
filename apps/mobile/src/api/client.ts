import * as SecureStore from "@/src/lib/secure-storage";
import type { ApiErrorCode } from "@atelier/shared";

export const TOKEN_KEY = "atelier.access_token.v1";
const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  // A-11 — `code` machine-readable adjuntado al body de error por el server.
  // El cliente lo prioriza sobre `message` cuando traduce con i18n. `code`
  // queda undefined para clientes hablando con servers viejos o para errores
  // que el server todavía no migró (ningún drama, se cae al `message`).
  public code: ApiErrorCode | undefined;

  constructor(
    public status: number,
    message: string,
    code?: ApiErrorCode,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
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
    let code: ApiErrorCode | undefined;
    try {
      const json = await res.json();
      message = json?.error ?? message;
      // A-11: el server adjunta `code` cuando puede. Si no viene, queda undef.
      if (typeof json?.code === "string") code = json.code as ApiErrorCode;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, message, code);
  }

  // 204 No Content (e.g. menu DELETE) has no body to parse.
  if (res.status === 204) return null as T;

  return res.json() as Promise<T>;
}
