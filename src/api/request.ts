const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3880/api';

export type QueryValue = string | number | boolean | undefined | null;

function readableError(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readableError).filter(Boolean).join('；');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readableError(record.message ?? record.detail ?? record.error ?? record.errors) || JSON.stringify(value);
  }
  return value == null ? '' : String(value);
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

export async function request<T>(path: string, options: RequestInit = {}, query?: Record<string, QueryValue>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(readableError(payload?.message ?? payload) || `接口请求失败（HTTP ${response.status}）`) as Error & { errors?: string[] };
    if (Array.isArray(payload?.errors)) {
      error.errors = payload.errors;
    }
    throw error;
  }
  return payload as T;
}
