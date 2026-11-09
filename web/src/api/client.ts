import type { ApiErrorBody, ErrorCode, StreamEvent } from '@persona/shared/client';

/** Errore restituito dal backend con codice stabile (tradotto nell'interfaccia). */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode | 'network',
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* corpo non JSON */
  }
  const code = (body?.error?.code ?? (res.status === 404 ? 'not_found' : 'internal')) as ErrorCode;
  return new ApiError(code, body?.error?.message ?? res.statusText, res.status, body?.error?.details);
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const isBinary = body instanceof Blob || body instanceof ArrayBuffer;
    res = await fetch(url, {
      method,
      headers:
        body === undefined ? undefined : isBinary ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isBinary ? (body as BodyInit) : JSON.stringify(body),
      ...init,
    });
  } catch (err) {
    throw new ApiError('network', (err as Error).message, 0);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? await res.json() : await res.text()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T = void>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, file: Blob) => request<T>('POST', url, file),
};

/** Analizza un flusso SSE (testo) in eventi. Gestisce eventi spezzati tra chunk. */
export class SseParser {
  private buffer = '';
  push(text: string): StreamEvent[] {
    this.buffer += text;
    const events: StreamEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as StreamEvent);
      } catch {
        /* evento malformato: ignorato */
      }
    }
    return events;
  }
}

/** POST con risposta in streaming (Server-Sent Events). */
export async function streamPost(
  url: string,
  body: unknown,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body ?? {}),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    throw new ApiError('network', (err as Error).message, 0);
  }
  if (!res.ok) throw await toApiError(res);
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const e of parser.push(decoder.decode(value, { stream: true }))) onEvent(e);
    }
  } catch (err) {
    if (signal?.aborted) return;
    throw new ApiError('network', (err as Error).message, 0);
  }
}

export function downloadUrl(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
