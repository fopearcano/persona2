import type { ModelConfig, ModelInfo } from '@persona/shared';
import type { modelConfigurations } from '../db/schema.js';
import { MockProvider } from './mock.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { LlmError, type LlmProvider } from './types.js';

type ModelConfigRow = typeof modelConfigurations.$inferSelect;

export const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1';

/** Risolve la chiave API: valore salvato sul backend, altrimenti variabile d'ambiente. */
export function resolveApiKey(row: Pick<ModelConfigRow, 'providerType' | 'apiKey'>): string | null {
  if (row.apiKey) return row.apiKey;
  if (row.providerType === 'openai') return process.env.OPENAI_API_KEY ?? null;
  if (row.providerType === 'openai-compatible') return process.env.PERSONA_COMPAT_API_KEY ?? null;
  return null;
}

export interface ProviderFactory {
  create(row: Pick<ModelConfigRow, 'providerType' | 'baseUrl' | 'apiKey'>): LlmProvider;
}

export function createProviderFactory(opts: { mockDelayMs: number }): ProviderFactory {
  return {
    create(row) {
      switch (row.providerType) {
        case 'mock':
          return new MockProvider(opts.mockDelayMs);
        case 'openai':
          return new OpenAICompatibleProvider({
            type: 'openai',
            baseUrl: row.baseUrl || DEFAULT_OPENAI_URL,
            apiKey: resolveApiKey(row),
          });
        case 'lmstudio':
        case 'openai-compatible':
          return new OpenAICompatibleProvider({
            type: row.providerType,
            baseUrl: row.baseUrl,
            apiKey: resolveApiKey(row),
          });
        default:
          throw new LlmError('llm_error', `Provider non supportato: ${row.providerType}`);
      }
    },
  };
}

/**
 * Determina il modello da usare. Se la configurazione non specifica un modello,
 * usa il primo modello caricato (LM Studio) o il primo disponibile.
 */
export async function resolveModelId(provider: LlmProvider, configured: string, signal?: AbortSignal): Promise<string> {
  if (configured) return configured;
  const models = await provider.listModels(signal);
  const llms = models.filter((m) => !m.type || m.type === 'llm' || m.type === 'vlm');
  const pick: ModelInfo | undefined = llms.find((m) => m.loaded === true) ?? llms[0];
  if (!pick) throw new LlmError('llm_model_not_found', 'Nessun modello disponibile sul server');
  return pick.id;
}

export function toModelConfigDto(row: ModelConfigRow): ModelConfig {
  const envKey =
    !row.apiKey &&
    ((row.providerType === 'openai' && !!process.env.OPENAI_API_KEY) ||
      (row.providerType === 'openai-compatible' && !!process.env.PERSONA_COMPAT_API_KEY));
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType as ModelConfig['providerType'],
    baseUrl: row.baseUrl,
    model: row.model,
    temperature: row.temperature,
    topP: row.topP,
    maxTokens: row.maxTokens,
    contextLength: row.contextLength,
    isDefault: row.isDefault,
    hasApiKey: !!row.apiKey || envKey,
    apiKeyFromEnv: envKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
