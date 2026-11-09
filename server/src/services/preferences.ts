import type { Preferences, PreferencesUpdate } from '@persona/shared';
import { preferencesUpdateSchema } from '@persona/shared';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { userPreferences } from '../db/schema.js';
import { nowIso, parseJson, validate } from '../lib/util.js';

export const DEFAULT_PREFERENCES: Preferences = {
  activeProjectId: null,
  uiLanguage: 'it',
  theme: 'dark',
  appearance: {
    fontUi: 'system',
    fontText: 'system',
    textSize: 'normal',
    accent: 'default',
    accentCustom: null,
  },
  conversationLanguage: 'auto',
  defaultModelConfigId: null,
  memory: {
    autoProcess: true,
    processThreshold: 12,
    keepRecentMessages: 8,
    reviewExtracted: false,
  },
  context: {
    memoryRatio: 0.18,
    knowledgeRatio: 0.12,
    summaryRatio: 0.12,
    excerptRatio: 0.08,
    maxMemories: 24,
    maxKnowledgeChunks: 6,
    maxExcerpts: 4,
    includeExcerpts: true,
  },
  embeddings: {
    enabled: false,
    modelConfigId: null,
    model: '',
    semanticWeight: 0.6,
  },
};

const KEY = 'preferences';
/** Gruppi di preferenze aggiornati per unione (un aggiornamento parziale non azzera gli altri campi). */
const NESTED = new Set(['appearance', 'memory', 'context', 'embeddings']);
const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export function getPreferences(ctx: AppContext): Preferences {
  const row = ctx.dbm.db.select().from(userPreferences).where(eq(userPreferences.key, KEY)).get();
  const stored = parseJson<Partial<Preferences>>(row?.value, {});
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    appearance: { ...DEFAULT_PREFERENCES.appearance, ...(stored.appearance ?? {}) },
    memory: { ...DEFAULT_PREFERENCES.memory, ...(stored.memory ?? {}) },
    context: { ...DEFAULT_PREFERENCES.context, ...(stored.context ?? {}) },
    embeddings: { ...DEFAULT_PREFERENCES.embeddings, ...(stored.embeddings ?? {}) },
  };
}

export function updatePreferences(ctx: AppContext, input: PreferencesUpdate): Preferences {
  const patch = validate(preferencesUpdateSchema, input);
  const current = getPreferences(ctx);
  const next: Preferences = {
    ...current,
    ...Object.fromEntries(
      Object.entries(patch).filter(([k, v]) => v !== undefined && !NESTED.has(k)),
    ),
    appearance: { ...current.appearance, ...stripUndefined(patch.appearance ?? {}) },
    memory: { ...current.memory, ...(patch.memory ?? {}) },
    context: { ...current.context, ...(patch.context ?? {}) },
    embeddings: { ...current.embeddings, ...(patch.embeddings ?? {}) },
  } as Preferences;
  const value = JSON.stringify(next);
  ctx.dbm.db
    .insert(userPreferences)
    .values({ key: KEY, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: userPreferences.key, set: { value, updatedAt: nowIso() } })
    .run();
  return next;
}
