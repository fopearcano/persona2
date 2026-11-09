import type { ModelInfo, ProviderType } from '@persona/shared';
import { ThinkFilter } from './think-filter.js';
import { type ChatChunk, type ChatMessage, type InferenceParams, LlmError, type LlmProvider } from './types.js';

export interface OpenAICompatibleOptions {
  type: ProviderType;
  baseUrl: string;
  apiKey?: string | null;
  /** Tempo massimo di attesa per la prima risposta (il caricamento JIT di LM Studio può essere lento). */
  connectTimeoutMs?: number;
  /** Tempo massimo di inattività tra due chunk dello stream. */
  idleTimeoutMs?: number;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Provider per API compatibili OpenAI: LM Studio (prioritario), OpenAI,
 * e altri server compatibili (llama.cpp server, vLLM, Ollama /v1, …).
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly type: ProviderType;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly connectTimeoutMs: number;
  private readonly idleTimeoutMs: number;

  constructor(opts: OpenAICompatibleOptions) {
    this.type = opts.type;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey ?? null;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 120_000;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 180_000;
    if (!this.baseUrl) throw new LlmError('llm_unavailable', 'Endpoint non configurato');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    try {
      const res = await fetch(this.baseUrl + path, { ...init, signal: controller.signal });
      return res;
    } catch (err) {
      if (signal?.aborted) throw new LlmError('aborted', 'Richiesta annullata');
      if (controller.signal.aborted) throw new LlmError('llm_timeout', `Nessuna risposta da ${this.baseUrl} entro ${timeoutMs} ms`);
      throw new LlmError('llm_unavailable', `Impossibile contattare ${this.baseUrl}: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private async failFromResponse(res: Response): Promise<never> {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignora */
    }
    if (res.status === 401 || res.status === 403) throw new LlmError('llm_auth', `Autenticazione rifiutata (${res.status})`, res.status);
    if (res.status === 404 && /model/i.test(detail)) throw new LlmError('llm_model_not_found', `Modello non trovato: ${detail}`, 404);
    if (/model.*(not found|not loaded|does not exist)|no models? loaded/i.test(detail)) {
      throw new LlmError('llm_model_not_found', detail, res.status);
    }
    throw new LlmError('llm_error', `Errore HTTP ${res.status}: ${detail}`, res.status);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    if (this.type === 'lmstudio') {
      const native = await this.listLmStudioNative(signal);
      if (native) return native;
    }
    const res = await this.request('/models', { method: 'GET', headers: this.headers() }, 15_000, signal);
    if (!res.ok) await this.failFromResponse(res);
    const body = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
    if (!body || !Array.isArray(body.data)) throw new LlmError('llm_bad_response', 'Risposta /models non valida');
    return body.data.map((m) => ({ id: m.id, loaded: null, contextLength: null, type: null }));
  }

  /** API REST nativa di LM Studio (/api/v0/models): stato di caricamento e contesto massimo. */
  private async listLmStudioNative(signal?: AbortSignal): Promise<ModelInfo[] | null> {
    const origin = this.baseUrl.replace(/\/v1$/, '');
    if (origin === this.baseUrl) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      const res = await fetch(`${origin}/api/v0/models`, { headers: this.headers(), signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { id: string; state?: string; max_context_length?: number; type?: string }[];
      };
      if (!Array.isArray(body.data)) return null;
      return body.data.map((m) => ({
        id: m.id,
        loaded: m.state ? m.state === 'loaded' : null,
        contextLength: m.max_context_length ?? null,
        type: m.type ?? null,
      }));
    } catch {
      return null;
    }
  }

  async embed(texts: string[], model: string, signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.request(
      '/embeddings',
      { method: 'POST', headers: this.headers(), body: JSON.stringify({ model, input: texts }) },
      this.connectTimeoutMs,
      signal,
    );
    if (!res.ok) await this.failFromResponse(res);
    const body = (await res.json().catch(() => null)) as { data?: { embedding?: number[]; index?: number }[] } | null;
    if (!body || !Array.isArray(body.data) || body.data.length !== texts.length) {
      throw new LlmError('llm_bad_response', 'Risposta /embeddings non valida');
    }
    const sorted = [...body.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((d) => {
      if (!Array.isArray(d.embedding) || d.embedding.length === 0) throw new LlmError('llm_bad_response', 'Embedding mancante');
      return d.embedding;
    });
  }

  async *chatStream(messages: ChatMessage[], params: InferenceParams, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      stream: true,
    };
    if (params.temperature != null) body.temperature = params.temperature;
    if (params.topP != null) body.top_p = params.topP;
    if (params.maxTokens != null) body.max_tokens = params.maxTokens;

    const res = await this.request(
      '/chat/completions',
      { method: 'POST', headers: { ...this.headers(), Accept: 'text/event-stream' }, body: JSON.stringify(body) },
      this.connectTimeoutMs,
      signal,
    );
    if (!res.ok) await this.failFromResponse(res);
    if (!res.body) throw new LlmError('llm_bad_response', 'Risposta senza corpo');

    const contentType = res.headers.get('content-type') ?? '';
    const filter = new ThinkFilter();

    // Alcuni server ignorano stream=true e restituiscono JSON completo.
    if (contentType.includes('application/json')) {
      const json = (await res.json()) as {
        choices?: { message?: { content?: string; reasoning_content?: string } }[];
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new LlmError('llm_bad_response', 'Risposta senza choices');
      if (msg.reasoning_content) yield { type: 'reasoning', text: msg.reasoning_content };
      for (const c of [...filter.push(msg.content ?? ''), ...filter.flush()]) yield c;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let idleTimer: NodeJS.Timeout | null = null;
    let idleExpired = false;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleExpired = true;
        void reader.cancel().catch(() => undefined);
      }, this.idleTimeoutMs);
    };
    const onAbort = () => void reader.cancel().catch(() => undefined);
    signal?.addEventListener('abort', onAbort, { once: true });

    let finished = false;
    try {
      armIdle();
      for (;;) {
        let chunk: Awaited<ReturnType<typeof reader.read>>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (signal?.aborted) throw new LlmError('aborted', 'Richiesta annullata');
          throw new LlmError('llm_unavailable', `Stream interrotto: ${(err as Error).message}`);
        }
        if (signal?.aborted) throw new LlmError('aborted', 'Richiesta annullata');
        if (idleExpired) throw new LlmError('llm_timeout', 'Lo stream si è interrotto per inattività');
        if (chunk.done) {
          finished = true;
          break;
        }
        armIdle();
        buffer += decoder.decode(chunk.value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, '');
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') {
            finished = true;
            for (const c of filter.flush()) yield c;
            return;
          }
          let parsed: {
            choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }[];
            error?: { message?: string } | string;
          };
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }
          if (parsed.error) {
            const msg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message ?? 'errore');
            throw new LlmError('llm_error', msg);
          }
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (reasoning) yield { type: 'reasoning', text: reasoning };
          if (delta.content) for (const c of filter.push(delta.content)) yield c;
        }
      }
      if (idleExpired) throw new LlmError('llm_timeout', 'Lo stream si è interrotto per inattività');
      for (const c of filter.flush()) yield c;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      signal?.removeEventListener('abort', onAbort);
      // Il consumatore può interrompere lo stream: chiudi la connessione.
      if (!finished) void reader.cancel().catch(() => undefined);
    }
  }
}
