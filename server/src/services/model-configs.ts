import type { ConnectionTestResult, EngineStatus, ModelConfig, ModelConfigInput, ModelInfo } from '@persona/shared';
import { modelConfigInputSchema, modelProbeSchema } from '@persona/shared';
import { asc, eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { characters, modelConfigurations } from '../db/schema.js';
import { DEFAULT_OPENAI_URL, resolveModelId, toModelConfigDto } from '../llm/registry.js';
import { collectChat, LlmError, type LlmProvider } from '../llm/types.js';
import { AppError, newId, notFound, nowIso, validate } from '../lib/util.js';
import { getPreferences, updatePreferences } from './preferences.js';

type Row = typeof modelConfigurations.$inferSelect;

export function listModelConfigs(ctx: AppContext): ModelConfig[] {
  return ctx.dbm.db.select().from(modelConfigurations).orderBy(asc(modelConfigurations.createdAt)).all().map(toModelConfigDto);
}

export function getModelConfigRow(ctx: AppContext, id: string): Row {
  const row = ctx.dbm.db.select().from(modelConfigurations).where(eq(modelConfigurations.id, id)).get();
  if (!row) throw notFound('Configurazione modello', id);
  return row;
}

function defaultBaseUrl(ctx: AppContext, providerType: string, baseUrl: string): string {
  if (baseUrl) return baseUrl;
  if (providerType === 'lmstudio') return ctx.config.lmStudioUrl;
  if (providerType === 'openai') return DEFAULT_OPENAI_URL;
  return '';
}

function setDefault(ctx: AppContext, id: string) {
  ctx.dbm.db.update(modelConfigurations).set({ isDefault: false }).run();
  ctx.dbm.db.update(modelConfigurations).set({ isDefault: true }).where(eq(modelConfigurations.id, id)).run();
  updatePreferences(ctx, { defaultModelConfigId: id });
}

export function createModelConfig(ctx: AppContext, input: ModelConfigInput): ModelConfig {
  const data = validate(modelConfigInputSchema, input);
  if (data.providerType === 'openai-compatible' && !data.baseUrl) {
    throw new AppError('validation', 'baseUrl obbligatorio per provider compatibili OpenAI');
  }
  const id = newId();
  const ts = nowIso();
  const hasAny = ctx.dbm.db.select({ id: modelConfigurations.id }).from(modelConfigurations).limit(1).all().length > 0;
  ctx.dbm.db
    .insert(modelConfigurations)
    .values({
      id,
      name: data.name,
      providerType: data.providerType,
      baseUrl: defaultBaseUrl(ctx, data.providerType, data.baseUrl),
      model: data.model,
      temperature: data.temperature,
      topP: data.topP,
      maxTokens: data.maxTokens,
      contextLength: data.contextLength,
      isDefault: false,
      apiKey: data.apiKey ? data.apiKey : null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  if (data.isDefault || !hasAny) setDefault(ctx, id);
  return toModelConfigDto(getModelConfigRow(ctx, id));
}

export function updateModelConfig(ctx: AppContext, id: string, input: ModelConfigInput): ModelConfig {
  const existing = getModelConfigRow(ctx, id);
  const data = validate(modelConfigInputSchema, input);
  ctx.dbm.db
    .update(modelConfigurations)
    .set({
      name: data.name,
      providerType: data.providerType,
      baseUrl: defaultBaseUrl(ctx, data.providerType, data.baseUrl),
      model: data.model,
      temperature: data.temperature,
      topP: data.topP,
      maxTokens: data.maxTokens,
      contextLength: data.contextLength,
      // undefined = chiave invariata; null/"" = rimossa.
      apiKey: data.apiKey === undefined ? existing.apiKey : data.apiKey || null,
      updatedAt: nowIso(),
    })
    .where(eq(modelConfigurations.id, id))
    .run();
  if (data.isDefault) setDefault(ctx, id);
  return toModelConfigDto(getModelConfigRow(ctx, id));
}

export function deleteModelConfig(ctx: AppContext, id: string): void {
  const row = getModelConfigRow(ctx, id);
  // I personaggi che usavano questa configurazione tornano al modello predefinito:
  // l'identità e la memoria non vengono toccate.
  ctx.dbm.db.update(characters).set({ modelConfigId: null }).where(eq(characters.modelConfigId, id)).run();
  ctx.dbm.db.delete(modelConfigurations).where(eq(modelConfigurations.id, id)).run();
  if (row.isDefault) {
    const next = ctx.dbm.db.select().from(modelConfigurations).orderBy(asc(modelConfigurations.createdAt)).get();
    if (next) setDefault(ctx, next.id);
    else updatePreferences(ctx, { defaultModelConfigId: null });
  }
}

/** Crea le configurazioni iniziali al primo avvio. */
export function seedModelConfigs(ctx: AppContext): void {
  const existing = ctx.dbm.db.select({ id: modelConfigurations.id }).from(modelConfigurations).limit(1).all();
  if (existing.length > 0) return;
  createModelConfig(ctx, {
    name: 'LM Studio (locale)',
    providerType: 'lmstudio',
    baseUrl: ctx.config.lmStudioUrl,
    model: '',
    temperature: 0.8,
    maxTokens: 1024,
    contextLength: 8192,
    isDefault: true,
  });
  createModelConfig(ctx, {
    name: 'Mock (demo offline, senza LLM)',
    providerType: 'mock',
    baseUrl: '',
    model: 'mock-persona',
    temperature: 0,
    maxTokens: 512,
    contextLength: 8192,
  });
}

export interface ResolvedEngine {
  config: Row;
  provider: LlmProvider;
  model: string;
}

/**
 * Seleziona il motore per un personaggio: configurazione del personaggio, altrimenti
 * predefinita. Cambiare motore non modifica in alcun modo identità o memorie.
 */
function resolveConfigRow(ctx: AppContext, modelConfigId: string | null): Row {
  let row: Row | undefined;
  if (modelConfigId) {
    row = ctx.dbm.db.select().from(modelConfigurations).where(eq(modelConfigurations.id, modelConfigId)).get();
  }
  if (!row) {
    const prefs = getPreferences(ctx);
    if (prefs.defaultModelConfigId) {
      row = ctx.dbm.db.select().from(modelConfigurations).where(eq(modelConfigurations.id, prefs.defaultModelConfigId)).get();
    }
  }
  if (!row) row = ctx.dbm.db.select().from(modelConfigurations).where(eq(modelConfigurations.isDefault, true)).get();
  if (!row) throw new AppError('no_model_config', 'Nessuna configurazione del modello disponibile', 409);
  return row;
}

export async function resolveEngine(ctx: AppContext, modelConfigId: string | null, signal?: AbortSignal): Promise<ResolvedEngine> {
  const row = resolveConfigRow(ctx, modelConfigId);
  const provider = ctx.providers.create(row);
  const model = await resolveModelId(provider, row.model, signal);
  return { config: row, provider, model };
}

function errorOf(err: unknown): ConnectionTestResult['error'] {
  if (err instanceof LlmError) return { code: err.code, message: err.message };
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: 'llm_error', message: (err as Error)?.message ?? String(err) };
}

async function runTest(
  provider: LlmProvider,
  configuredModel: string,
  withCompletion: boolean,
): Promise<ConnectionTestResult> {
  const started = Date.now();
  const result: ConnectionTestResult = {
    ok: false,
    latencyMs: 0,
    models: [],
    resolvedModel: null,
    modelAvailable: false,
    completionOk: null,
    sample: null,
    error: null,
  };
  try {
    result.models = await provider.listModels();
    result.resolvedModel = await resolveModelId(provider, configuredModel);
    result.modelAvailable = configuredModel ? result.models.some((m) => m.id === configuredModel) : true;
    if (withCompletion) {
      const res = await collectChat(
        provider,
        [
          { role: 'system', content: 'You are a connection test. Reply with the single word OK.' },
          { role: 'user', content: 'Reply with OK.' },
        ],
        { model: result.resolvedModel, maxTokens: 16, temperature: 0, purpose: 'test' },
      );
      result.completionOk = res.content.length > 0;
      result.sample = res.content.slice(0, 200);
    }
    result.ok = result.modelAvailable && result.completionOk !== false;
  } catch (err) {
    result.error = errorOf(err);
  }
  result.latencyMs = Date.now() - started;
  return result;
}

export async function testModelConfig(ctx: AppContext, id: string, withCompletion: boolean): Promise<ConnectionTestResult> {
  const row = getModelConfigRow(ctx, id);
  return runTest(ctx.providers.create(row), row.model, withCompletion);
}

/** Scoperta dei modelli per una configurazione non ancora salvata. */
export async function probeModels(ctx: AppContext, input: unknown): Promise<ModelInfo[]> {
  const data = validate(modelProbeSchema, input);
  const provider = ctx.providers.create({
    providerType: data.providerType,
    baseUrl: defaultBaseUrl(ctx, data.providerType, data.baseUrl),
    apiKey: data.apiKey ?? null,
  });
  return provider.listModels();
}

export async function listModelsFor(ctx: AppContext, id: string): Promise<ModelInfo[]> {
  return ctx.providers.create(getModelConfigRow(ctx, id)).listModels();
}

/**
 * Verifica rapida della disponibilità del motore (elenco modelli, timeout breve):
 * permette all'interfaccia di segnalare un LM Studio spento prima dell'invio.
 */
export async function engineStatus(ctx: AppContext, modelConfigId: string | null): Promise<EngineStatus> {
  const checkedAt = new Date().toISOString();
  let row: Row;
  try {
    row = resolveConfigRow(ctx, modelConfigId);
  } catch (err) {
    return { configId: null, configName: null, providerType: null, model: null, available: false, loaded: null, error: errorOf(err), checkedAt };
  }
  const base = { configId: row.id, configName: row.name, providerType: row.providerType as EngineStatus['providerType'], checkedAt };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const provider = ctx.providers.create(row);
    const models = await provider.listModels(controller.signal);
    const model = await resolveModelId(provider, row.model, controller.signal);
    const info = models.find((m) => m.id === model);
    if (row.model && !info) {
      return {
        ...base,
        model,
        available: false,
        loaded: null,
        error: { code: 'llm_model_not_found', message: `Modello non disponibile: ${model}` },
      };
    }
    return { ...base, model, available: true, loaded: info?.loaded ?? null, error: null };
  } catch (err) {
    const e = controller.signal.aborted ? { code: 'llm_timeout' as const, message: 'Nessuna risposta entro 4 s' } : errorOf(err);
    return { ...base, model: row.model || null, available: false, loaded: null, error: e };
  } finally {
    clearTimeout(timer);
  }
}
