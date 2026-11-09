import { z } from 'zod';
import {
  AUTO_LANGUAGE,
  CHARACTER_STATUSES,
  CONVERSATION_KINDS,
  DIALOGUE_MODES,
  EPISTEMIC_STATUSES,
  EXPERTISE_LEVELS,
  MEMORY_CATEGORIES,
  MEMORY_STATUSES,
  PROFICIENCY_LEVELS,
  PROVIDER_TYPES,
  PROJECT_STATUSES,
  SCENARIO_STATUSES,
  THEMES,
  FONT_CHOICES,
  TEXT_SIZES,
  ACCENT_CHOICES,
  TRAIT_CATEGORIES,
  TURN_MODES,
} from './constants.js';

/** Stringa facoltativa: stringhe vuote diventano null. */
const optText = (max = 20000) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      if (v == null) return null;
      const t = v.trim();
      return t.length === 0 ? null : v;
    });

/** Codice lingua BCP-47 semplificato (es. "it", "en-GB", "zh-Hant"). */
export const languageCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'invalid language code');

export const conversationLanguageSchema = z.union([z.literal(AUTO_LANGUAGE), languageCodeSchema]);

const score = z.number().int().min(0).max(100).nullable();

export const bigFiveSchema = z.object({
  openness: score.default(null),
  conscientiousness: score.default(null),
  extraversion: score.default(null),
  agreeableness: score.default(null),
  neuroticism: score.default(null),
});

export const traitInputSchema = z.object({
  category: z.enum(TRAIT_CATEGORIES),
  content: z.string().trim().min(1).max(2000),
});

export const languageInputSchema = z.object({
  code: languageCodeSchema,
  proficiency: z.enum(PROFICIENCY_LEVELS).default('fluent'),
  isNative: z.boolean().default(false),
  notes: optText(2000),
});

export const expertiseInputSchema = z.object({
  domain: z.string().trim().min(1).max(200),
  level: z.enum(EXPERTISE_LEVELS).default('competent'),
  description: optText(5000),
  subtopics: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
});

/** Ritratto: data URL immagine, max ~2.5 MB di testo. */
const portraitSchema = z
  .string()
  .max(3_500_000)
  .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'invalid portrait')
  .nullish()
  .transform((v) => v ?? null);

export const characterProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  age: optText(100),
  origin: optText(500),
  culturalBackground: optText(),
  occupation: optText(500),
  education: optText(),
  biography: optText(100000),
  appearance: optText(),
  portrait: portraitSchema,
  temperament: optText(),
  interpersonalStyle: optText(),
  conflictResponse: optText(),
  stressResponse: optText(),
  bigFive: bigFiveSchema.nullish().transform((v) => v ?? null),
  register: optText(),
  vocabulary: optText(),
  formality: optText(),
  humor: optText(),
  assertiveness: optText(),
  argumentativeStyle: optText(),
  conversationalDepth: optText(),
  culturalLinguisticNotes: optText(),
  preferredLanguage: languageCodeSchema.nullish().transform((v) => v ?? null),
  authorNotes: optText(50000),
});

export const characterInputSchema = characterProfileSchema.extend({
  modelConfigId: z.string().nullish().transform((v) => v ?? null),
  traits: z.array(traitInputSchema).max(500).default([]),
  languages: z.array(languageInputSchema).max(50).default([]),
  expertise: z.array(expertiseInputSchema).max(100).default([]),
  /** Motivo della modifica (registrato nella cronologia dell'identità). */
  revisionReason: optText(1000),
});
export type CharacterInput = z.input<typeof characterInputSchema>;
export type CharacterInputParsed = z.output<typeof characterInputSchema>;

export const characterStatusSchema = z.object({ status: z.enum(CHARACTER_STATUSES) });

/* ---------------- Progetti ---------------- */

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optText(5000),
  status: z.enum(PROJECT_STATUSES).default('active'),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

export const projectMembershipSchema = z.object({ characterId: z.string().min(1) });

export const projectImportOptionsSchema = z.object({
  /** reuse = riusa i personaggi con lo stesso id già presenti; new = importa sempre nuove identità. */
  characters: z.enum(['reuse', 'new']).default('reuse'),
  includeConversations: z.boolean().default(true),
  includeSessions: z.boolean().default(true),
});

export const variantInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  variantNote: optText(2000),
  /** Quali memorie copiare nella variante. */
  copyMemories: z.enum(['none', 'core', 'personal']).default('core'),
});

export const duplicateInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  copyMemories: z.enum(['none', 'core', 'personal']).default('none'),
});

/* ---------------- Conoscenza ---------------- */

export const knowledgeSourceInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  kind: z.enum(['text', 'markdown', 'note']).default('text'),
  content: z.string().min(1).max(2_000_000),
  sourceRef: optText(2000),
  epistemicStatus: z.enum(EPISTEMIC_STATUSES).default('fact'),
  language: languageCodeSchema.nullish().transform((v) => v ?? null),
  enabled: z.boolean().default(true),
});
export type KnowledgeSourceInput = z.input<typeof knowledgeSourceInputSchema>;

/* ---------------- Memoria ---------------- */

export const memoryInputSchema = z
  .object({
    characterId: z.string().min(1),
    category: z.enum(MEMORY_CATEGORIES),
    scenarioId: z.string().nullish().transform((v) => v ?? null),
    content: z.string().trim().min(1).max(20000),
    importance: z.number().int().min(1).max(5).default(3),
    epistemicStatus: z.enum(EPISTEMIC_STATUSES).default('fact'),
    language: languageCodeSchema.nullish().transform((v) => v ?? null),
    status: z.enum(MEMORY_STATUSES).default('active'),
    pinned: z.boolean().default(false),
    note: optText(2000),
  })
  .refine((m) => (m.category === 'contextual') === (m.scenarioId != null), {
    message: 'contextual memories require a scenarioId; other categories must not have one',
    path: ['scenarioId'],
  });
export type MemoryInput = z.input<typeof memoryInputSchema>;

export const memoryUpdateSchema = z.object({
  content: z.string().trim().min(1).max(20000).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  epistemicStatus: z.enum(EPISTEMIC_STATUSES).optional(),
  language: languageCodeSchema.nullish(),
  status: z.enum(MEMORY_STATUSES).optional(),
  pinned: z.boolean().optional(),
});
export type MemoryUpdate = z.input<typeof memoryUpdateSchema>;

export const memoryPromoteSchema = z.object({
  targetCategory: z.enum(['semantic', 'core']),
  content: z.string().trim().min(1).max(20000).optional(),
  note: optText(2000),
});

export const memoryQuerySchema = z.object({
  characterId: z.string().optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  scenarioId: z.string().optional(),
  status: z.enum(MEMORY_STATUSES).optional(),
  q: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export const retrievalPreviewSchema = z.object({
  characterId: z.string().min(1),
  scenarioId: z.string().nullish().transform((v) => v ?? null),
  query: z.string().max(5000).default(''),
});

/* ---------------- Conversazioni ---------------- */

export const conversationCreateSchema = z
  .object({
    kind: z.enum(CONVERSATION_KINDS).default('lab'),
    characterId: z.string().nullish().transform((v) => v ?? null),
    scenarioId: z.string().nullish().transform((v) => v ?? null),
    participantIds: z.array(z.string()).max(20).default([]),
    title: optText(300),
    language: conversationLanguageSchema.optional(),
    defaultMode: z.enum(DIALOGUE_MODES).default('dialogue'),
    turnMode: z.enum(TURN_MODES).default('manual'),
  })
  .superRefine((c, ctx) => {
    if (c.kind === 'lab' && !c.characterId) {
      ctx.addIssue({ code: 'custom', message: 'lab conversations require characterId', path: ['characterId'] });
    }
    if (c.kind === 'lab' && c.scenarioId) {
      ctx.addIssue({ code: 'custom', message: 'lab conversations cannot belong to a scenario', path: ['scenarioId'] });
    }
    if (c.kind !== 'lab' && !c.scenarioId) {
      ctx.addIssue({ code: 'custom', message: 'scenario/simulation conversations require scenarioId', path: ['scenarioId'] });
    }
    if (c.kind === 'scenario' && !c.characterId) {
      ctx.addIssue({ code: 'custom', message: 'scenario sessions require characterId', path: ['characterId'] });
    }
    if (c.kind === 'simulation' && c.participantIds.length < 1) {
      ctx.addIssue({ code: 'custom', message: 'simulations require participants', path: ['participantIds'] });
    }
  });
export type ConversationCreate = z.input<typeof conversationCreateSchema>;

export const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  language: conversationLanguageSchema.optional(),
  defaultMode: z.enum(DIALOGUE_MODES).optional(),
  turnMode: z.enum(TURN_MODES).optional(),
  archived: z.boolean().optional(),
  participantIds: z.array(z.string()).max(20).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(50000),
  mode: z.enum(DIALOGUE_MODES).optional(),
  /** Lingua della risposta per questo turno (sovrascrive quella della conversazione). */
  language: conversationLanguageSchema.optional(),
  /** Nelle simulazioni: il messaggio dell'autore non genera risposta automatica. */
  respond: z.boolean().default(true),
  /** author = parla l'autore; narrator = narrazione/evento di scena. */
  role: z.enum(['author', 'narrator']).default('author'),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const turnSchema = z.object({
  characterId: z.string().min(1).optional(),
  directive: optText(2000),
  language: conversationLanguageSchema.optional(),
});
export type TurnInput = z.input<typeof turnSchema>;

export const regenerateSchema = z.object({
  directive: optText(2000),
  language: conversationLanguageSchema.optional(),
});

export const messageUpdateSchema = z.object({
  content: z.string().trim().min(1).max(50000),
});

export const contextPreviewSchema = z.object({
  content: z.string().max(50000).default(''),
  mode: z.enum(DIALOGUE_MODES).optional(),
  characterId: z.string().optional(),
  language: conversationLanguageSchema.optional(),
});

export const processMemorySchema = z.object({
  /** Se true elabora anche se la soglia non è raggiunta. */
  force: z.boolean().default(true),
});

/* ---------------- Scenari ---------------- */

export const scenarioInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: optText(),
  setting: optText(50000),
  timeline: optText(50000),
  environment: optText(50000),
  initialSituation: optText(50000),
  currentSituation: optText(50000),
  knowledge: optText(200000),
  language: languageCodeSchema.nullish().transform((v) => v ?? null),
  status: z.enum(SCENARIO_STATUSES).default('active'),
  /** undefined = invariato (in modifica); null = nessun progetto. */
  projectId: z.string().min(1).nullable().optional(),
});
export type ScenarioInput = z.input<typeof scenarioInputSchema>;

export const participantInputSchema = z.object({
  characterId: z.string().min(1),
  role: optText(300),
  roleDescription: optText(),
  knowledge: optText(50000),
  objectives: optText(),
});
export type ParticipantInput = z.input<typeof participantInputSchema>;
export const participantUpdateSchema = participantInputSchema.omit({ characterId: true }).partial();

export const relationshipInputSchema = z.object({
  fromCharacterId: z.string().min(1),
  toCharacterId: z.string().min(1),
  description: z.string().trim().min(1).max(5000),
});

export const eventInputSchema = z.object({
  title: optText(300),
  content: z.string().trim().min(1).max(20000),
  fictionalTime: optText(300),
});

/* ---------------- Modelli e preferenze ---------------- */

export const modelConfigInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  providerType: z.enum(PROVIDER_TYPES),
  baseUrl: z.string().trim().max(2000).default(''),
  model: z.string().trim().max(500).default(''),
  temperature: z.number().min(0).max(2).default(0.8),
  topP: z.number().min(0).max(1).nullish().transform((v) => v ?? null),
  maxTokens: z.number().int().min(16).max(131072).default(1024),
  contextLength: z.number().int().min(512).max(2_000_000).default(8192),
  isDefault: z.boolean().default(false),
  /** undefined = invariata; null o "" = rimuovi; stringa = imposta. */
  apiKey: z.string().max(4000).nullish(),
});
export type ModelConfigInput = z.input<typeof modelConfigInputSchema>;

export const modelProbeSchema = z.object({
  providerType: z.enum(PROVIDER_TYPES),
  baseUrl: z.string().trim().max(2000).default(''),
  apiKey: z.string().max(4000).nullish(),
});

export const connectionTestSchema = z.object({
  /** Esegue anche un breve completamento di prova. */
  completion: z.boolean().default(true),
});

export const preferencesUpdateSchema = z.object({
  activeProjectId: z.string().min(1).nullable().optional(),
  uiLanguage: languageCodeSchema.optional(),
  theme: z.enum(THEMES).optional(),
  appearance: z
    .object({
      fontUi: z.enum(FONT_CHOICES),
      fontText: z.enum(FONT_CHOICES),
      textSize: z.enum(TEXT_SIZES),
      accent: z.enum(ACCENT_CHOICES),
      accentCustom: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Colore non valido (#rrggbb)')
        .transform((v) => v.toLowerCase())
        .nullable(),
    })
    .partial()
    .optional(),
  conversationLanguage: conversationLanguageSchema.optional(),
  defaultModelConfigId: z.string().nullable().optional(),
  memory: z
    .object({
      autoProcess: z.boolean(),
      processThreshold: z.number().int().min(4).max(200),
      keepRecentMessages: z.number().int().min(2).max(100),
      reviewExtracted: z.boolean(),
    })
    .partial()
    .optional(),
  context: z
    .object({
      memoryRatio: z.number().min(0).max(0.6),
      knowledgeRatio: z.number().min(0).max(0.6),
      summaryRatio: z.number().min(0).max(0.5),
      excerptRatio: z.number().min(0).max(0.4),
      maxMemories: z.number().int().min(0).max(200),
      maxKnowledgeChunks: z.number().int().min(0).max(50),
      maxExcerpts: z.number().int().min(0).max(50),
      includeExcerpts: z.boolean(),
    })
    .partial()
    .optional(),
  embeddings: z
    .object({
      enabled: z.boolean(),
      modelConfigId: z.string().nullable(),
      model: z.string().trim().max(500),
      semanticWeight: z.number().min(0).max(1),
    })
    .partial()
    .optional(),
});
export type PreferencesUpdate = z.input<typeof preferencesUpdateSchema>;

export const scenarioImportOptionsSchema = z.object({
  /** reuse = riusa i personaggi con lo stesso id se esistono; new = importa sempre copie nuove. */
  characters: z.enum(['reuse', 'new']).default('reuse'),
  includeSessions: z.boolean().default(true),
});

export const embeddingTestSchema = z.object({
  modelConfigId: z.string().nullish(),
  model: z.string().trim().max(500).optional(),
});

export const characterImportOptionsSchema = z.object({
  includeConversations: z.boolean().default(true),
  includeMemories: z.boolean().default(true),
  includeKnowledge: z.boolean().default(true),
});
