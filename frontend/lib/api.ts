export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export function websocketURL(path: string, token: string): string {
  const base = new URL(
    API_BASE_URL,
    typeof window !== "undefined" ? window.location.origin : "http://localhost:8080"
  );
  const isSecure = base.protocol === "https:" || (typeof window !== "undefined" && window.location.protocol === "https:");
  base.protocol = isSecure ? "wss:" : "ws:";
  const prefix = base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}${path}`;
  base.search = "";
  base.searchParams.set("access_token", token);
  return base.toString();
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const data = text ? safeJSON(text) : null;
  if (!response.ok) {
    const message = extractError(data) || response.statusText || "Request failed";
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractError(data: unknown): string | null {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.detail === "string") return record.detail;
  }
  return null;
}
