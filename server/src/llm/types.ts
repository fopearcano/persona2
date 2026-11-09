import type { ErrorCode, ModelInfo, ProviderType } from '@persona/shared';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Scopo della richiesta: i provider reali lo ignorano, il mock lo usa per risposte deterministiche. */
export type InferencePurpose = 'character' | 'analysis' | 'summarize' | 'extract' | 'consistency' | 'title' | 'turn' | 'test';

export interface InferenceParams {
  model: string;
  temperature?: number;
  topP?: number | null;
  maxTokens?: number;
  purpose?: InferencePurpose;
}

export interface ChatChunk {
  type: 'content' | 'reasoning';
  text: string;
}

export interface ChatResult {
  content: string;
  reasoning: string | null;
}

/**
 * Adattatore indipendente dal provider. L'LLM è un motore di inferenza
 * intercambiabile: non conserva alcuno stato del personaggio.
 */
export interface LlmProvider {
  readonly type: ProviderType;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  chatStream(messages: ChatMessage[], params: InferenceParams, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  /** Embedding dei testi (stesso ordine dell'input). Facoltativo: non tutti i provider lo offrono. */
  embed?(texts: string[], model: string, signal?: AbortSignal): Promise<number[][]>;
}

export class LlmError extends Error {
  constructor(
    public readonly code: Extract<
      ErrorCode,
      'llm_unavailable' | 'llm_timeout' | 'llm_model_not_found' | 'llm_auth' | 'llm_bad_response' | 'llm_error' | 'aborted'
    >,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Esegue una richiesta in streaming e restituisce il testo completo. */
export async function collectChat(
  provider: LlmProvider,
  messages: ChatMessage[],
  params: InferenceParams,
  signal?: AbortSignal,
): Promise<ChatResult> {
  let content = '';
  let reasoning = '';
  for await (const chunk of provider.chatStream(messages, params, signal)) {
    if (chunk.type === 'content') content += chunk.text;
    else reasoning += chunk.text;
  }
  return { content: content.trim(), reasoning: reasoning.trim() || null };
}
