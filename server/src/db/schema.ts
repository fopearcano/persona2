/**
 * Schema del database PERSONA (SQLite + Drizzle).
 *
 * Principio architetturale: l'IDENTITÀ (characters + tabelle collegate + memorie core)
 * è separata dagli AMBIENTI di interazione (conversations, scenarios) e dal MOTORE LLM
 * (model_configurations). Le tabelle FTS5 per il recupero lessicale sono create
 * da una migrazione SQL personalizzata (vedi drizzle/*_fts.sql) e non compaiono qui.
 *
 * Timestamp: stringhe ISO-8601 UTC. Id: UUID v4 testuali.
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () => text('created_at').notNull();
const updatedAt = () => text('updated_at').notNull();

/* ------------------------------------------------------------------ */
/* Identità persistente                                                */
/* ------------------------------------------------------------------ */

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    age: text('age'),
    origin: text('origin'),
    culturalBackground: text('cultural_background'),
    occupation: text('occupation'),
    education: text('education'),
    biography: text('biography'),
    appearance: text('appearance'),
    portrait: text('portrait'),
    temperament: text('temperament'),
    interpersonalStyle: text('interpersonal_style'),
    conflictResponse: text('conflict_response'),
    stressResponse: text('stress_response'),
    /** JSON BigFive | null */
    bigFive: text('big_five'),
    register: text('register'),
    vocabulary: text('vocabulary'),
    formality: text('formality'),
    humor: text('humor'),
    assertiveness: text('assertiveness'),
    argumentativeStyle: text('argumentative_style'),
    conversationalDepth: text('conversational_depth'),
    culturalLinguisticNotes: text('cultural_linguistic_notes'),
    preferredLanguage: text('preferred_language'),
    authorNotes: text('author_notes'),
    status: text('status').notNull().default('active'),
    /** Variante derivata da un altro personaggio (l'originale resta intatto). */
    parentId: text('parent_id'),
    variantNote: text('variant_note'),
    modelConfigId: text('model_config_id').references(() => modelConfigurations.id, { onDelete: 'set null' }),
    identityVersion: integer('identity_version').notNull().default(1),
    /**
     * JSON CharacterBuild | null: la costruzione McKee in sedici stazioni (PERSONA 2).
     * Fa parte dell'identità (revisioni). I Big Five restano in `big_five`.
     */
    build: text('build'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('characters_status_idx').on(t.status), index('characters_parent_idx').on(t.parentId)],
);

export const characterTraits = sqliteTable(
  'character_traits',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    content: text('content').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('character_traits_character_idx').on(t.characterId)],
);

export const characterLanguages = sqliteTable(
  'character_languages',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    proficiency: text('proficiency').notNull(),
    isNative: integer('is_native', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('character_languages_character_idx').on(t.characterId)],
);

export const expertise = sqliteTable(
  'expertise',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    level: text('level').notNull(),
    description: text('description'),
    /** JSON string[] */
    subtopics: text('subtopics').notNull().default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('expertise_character_idx').on(t.characterId)],
);

/** Istantanee dell'identità prima di ogni modifica (aggiornamenti controllati e reversibili). */
export const identityRevisions = sqliteTable(
  'identity_revisions',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** JSON CharacterSnapshot */
    snapshot: text('snapshot').notNull(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('identity_revisions_character_idx').on(t.characterId)],
);

/* ------------------------------------------------------------------ */
/* Base di conoscenza                                                  */
/* ------------------------------------------------------------------ */

export const knowledgeSources = sqliteTable(
  'knowledge_sources',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('text'),
    content: text('content').notNull(),
    sourceRef: text('source_ref'),
    epistemicStatus: text('epistemic_status').notNull().default('fact'),
    language: text('language'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('knowledge_sources_character_idx').on(t.characterId)],
);

/** Frammenti indicizzati (FTS5 oggi; colonna embedding prevista per RAG futuro). */
export const knowledgeChunks = sqliteTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    content: text('content').notNull(),
    /** Embedding locale (Float32 little-endian in base64) per il recupero semantico. */
    embedding: text('embedding'),
    /** Modello che ha prodotto l'embedding: se cambia, il frammento va reindicizzato. */
    embeddingModel: text('embedding_model'),
  },
  (t) => [index('knowledge_chunks_source_idx').on(t.sourceId)],
);

/* ------------------------------------------------------------------ */
/* Memoria                                                             */
/* ------------------------------------------------------------------ */

export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** core | episodic | semantic | contextual */
    category: text('category').notNull(),
    /** Solo per le memorie contestuali: isolate nello scenario. */
    scenarioId: text('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    importance: integer('importance').notNull().default(3),
    epistemicStatus: text('epistemic_status').notNull().default('fact'),
    language: text('language'),
    status: text('status').notNull().default('active'),
    origin: text('origin').notNull().default('author'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    promotedFromId: text('promoted_from_id'),
    retrievalCount: integer('retrieval_count').notNull().default(0),
    lastRetrievedAt: text('last_retrieved_at'),
    /** Embedding multilingue locale (Float32 little-endian in base64), facoltativo. */
    embedding: text('embedding'),
    embeddingModel: text('embedding_model'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('memories_character_idx').on(t.characterId, t.category, t.status),
    index('memories_scenario_idx').on(t.scenarioId),
  ],
);

/** Provenienza delle memorie (conversazione, messaggi, scenario, nota). */
export const memorySources = sqliteTable(
  'memory_sources',
  {
    id: text('id').primaryKey(),
    memoryId: text('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id'),
    messageId: text('message_id'),
    scenarioId: text('scenario_id'),
    fromSeq: integer('from_seq'),
    toSeq: integer('to_seq'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('memory_sources_memory_idx').on(t.memoryId)],
);

/* ------------------------------------------------------------------ */
/* Progetti (storie)                                                   */
/* ------------------------------------------------------------------ */

/** Un progetto raggruppa personaggi, scenari e simulazioni di una stessa storia/opera. */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  /** JSON StoryDesign | null: impianto narrativo McKee (genere, tema, mondo) condiviso dal cast. */
  story: text('story'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Appartenenza dei personaggi ai progetti (molti-a-molti): la stessa identità può partecipare
 * a più storie senza essere duplicata. Eliminare un progetto non elimina i personaggi.
 */
export const projectCharacters = sqliteTable(
  'project_characters',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    addedAt: text('added_at').notNull(),
  },
  (t) => [
    uniqueIndex('project_characters_unique').on(t.projectId, t.characterId),
    index('project_characters_character_idx').on(t.characterId),
  ],
);

/* ------------------------------------------------------------------ */
/* Ambienti: scenari                                                   */
/* ------------------------------------------------------------------ */

export const scenarios = sqliteTable(
  'scenarios',
  {
    id: text('id').primaryKey(),
    /** Progetto di appartenenza: eliminando il progetto si eliminano i suoi scenari (non i personaggi). */
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    setting: text('setting'),
    timeline: text('timeline'),
    environment: text('environment'),
    initialSituation: text('initial_situation'),
    currentSituation: text('current_situation'),
    knowledge: text('knowledge'),
    language: text('language'),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('scenarios_project_idx').on(t.projectId)],
);

export const scenarioParticipants = sqliteTable(
  'scenario_participants',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    role: text('role'),
    roleDescription: text('role_description'),
    knowledge: text('knowledge'),
    objectives: text('objectives'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('scenario_participants_unique').on(t.scenarioId, t.characterId)],
);

export const scenarioRelationships = sqliteTable(
  'scenario_relationships',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    fromCharacterId: text('from_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    toCharacterId: text('to_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('scenario_relationships_scenario_idx').on(t.scenarioId)],
);

export const scenarioEvents = sqliteTable(
  'scenario_events',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    title: text('title'),
    content: text('content').notNull(),
    fictionalTime: text('fictional_time'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('scenario_events_scenario_idx').on(t.scenarioId)],
);

/* ------------------------------------------------------------------ */
/* Ambienti: conversazioni (laboratorio, sessioni narrative, simulazioni) */
/* ------------------------------------------------------------------ */

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    /** lab | scenario | simulation */
    kind: text('kind').notNull(),
    /** Personaggio principale (lab, scenario). Null per le simulazioni. */
    characterId: text('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    scenarioId: text('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    language: text('language').notNull().default('auto'),
    defaultMode: text('default_mode').notNull().default('dialogue'),
    turnMode: text('turn_mode').notNull().default('manual'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    /** Ultimo seq coperto dal riassunto incrementale. */
    summarizedSeq: integer('summarized_seq').notNull().default(0),
    /** Ultimo seq già elaborato per l'estrazione di memorie. */
    memoryProcessedSeq: integer('memory_processed_seq').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('conversations_character_idx').on(t.characterId),
    index('conversations_scenario_idx').on(t.scenarioId),
  ],
);

export const conversationParticipants = sqliteTable(
  'conversation_participants',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('conversation_participants_unique').on(t.conversationId, t.characterId)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    /** author | character | analysis | narrator */
    role: text('role').notNull(),
    characterId: text('character_id').references(() => characters.id, { onDelete: 'set null' }),
    /** Nome del parlante al momento della generazione (sopravvive all'eliminazione). */
    speakerName: text('speaker_name'),
    content: text('content').notNull(),
    reasoning: text('reasoning'),
    mode: text('mode').notNull().default('dialogue'),
    language: text('language'),
    status: text('status').notNull().default('complete'),
    providerType: text('provider_type'),
    model: text('model'),
    /** JSON ContextMeta: cosa è stato inviato al modello (ispezione del contesto). */
    contextMeta: text('context_meta'),
    regeneratedFromId: text('regenerated_from_id'),
    editedAt: text('edited_at'),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.seq)],
);

/** Versioni precedenti dei messaggi modificati: nulla viene perso. */
export const messageRevisions = sqliteTable(
  'message_revisions',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('message_revisions_message_idx').on(t.messageId)],
);

/** Riassunti incrementali: non sostituiscono né cancellano i messaggi originali. */
export const conversationSummaries = sqliteTable(
  'conversation_summaries',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    fromSeq: integer('from_seq').notNull(),
    toSeq: integer('to_seq').notNull(),
    content: text('content').notNull(),
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [index('conversation_summaries_conversation_idx').on(t.conversationId, t.toSeq)],
);

/* ------------------------------------------------------------------ */
/* Motore LLM e preferenze                                             */
/* ------------------------------------------------------------------ */

export const modelConfigurations = sqliteTable('model_configurations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  providerType: text('provider_type').notNull(),
  baseUrl: text('base_url').notNull().default(''),
  model: text('model').notNull().default(''),
  temperature: real('temperature').notNull().default(0.8),
  topP: real('top_p'),
  maxTokens: integer('max_tokens').notNull().default(1024),
  contextLength: integer('context_length').notNull().default(8192),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  /** Conservata solo sul backend locale; mai restituita dalle API. */
  apiKey: text('api_key'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userPreferences = sqliteTable('user_preferences', {
  key: text('key').primaryKey(),
  /** JSON */
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/* ------------------------------------------------------------------ */
/* Coach McKee (PERSONA 2)                                             */
/* ------------------------------------------------------------------ */

/**
 * Conversazioni tra l'autore e il coach McKee su un personaggio. Non sono parlato del
 * personaggio: non entrano nel recupero, nelle memorie né negli estratti.
 */
export const coachThreads = sqliteTable(
  'coach_threads',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** Progetto (storia) di riferimento per cast e genere; null = nessuno. */
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** coach = consulente; guide = assistente che costruisce il personaggio chattando. */
    mode: text('mode').notNull().default('coach'),
    title: text('title').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('coach_threads_character_idx').on(t.characterId)],
);

export const coachMessages = sqliteTable(
  'coach_messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => coachThreads.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    /** author | coach */
    role: text('role').notNull(),
    content: text('content').notNull(),
    reasoning: text('reasoning'),
    /** Stazione su cui l'autore stava lavorando. */
    section: text('section'),
    /** JSON CoachProposal[] (proposte validate, con stato). */
    proposals: text('proposals'),
    /** JSON CoachMessageMeta (modello, passaggi del libro, istantanea). */
    meta: text('meta'),
    /** complete | incomplete | error */
    status: text('status').notNull().default('complete'),
    createdAt: createdAt(),
  },
  // Non univoco (dalla 0006): due dispositivi possono continuare lo stesso filo senza
  // sincronizzarsi; i messaggi con lo stesso seq si ordinano per data di creazione.
  (t) => [index('coach_messages_thread_seq_idx').on(t.threadId, t.seq)],
);

/* ------------------------------------------------------------------ */
/* Sincronizzazione tra dispositivi (cartella cloud)                   */
/* ------------------------------------------------------------------ */

/**
 * Stato della sincronizzazione di questo database (una sola riga, id = 1). Le tabelle sync_*
 * non vengono mai sincronizzate. I trigger di tracciamento (db/sync-triggers.ts) leggono
 * `applying` e `device_id`.
 */
export const syncMeta = sqliteTable('sync_meta', {
  id: integer('id').primaryKey(),
  /** Identità di questo dispositivo nella cartella condivisa (devices/<deviceId>/). */
  deviceId: text('device_id').notNull(),
  deviceName: text('device_name'),
  /** Impronta di computer + percorso del database: se cambia (database copiato) il dispositivo prende un nuovo id. */
  boundTo: text('bound_to'),
  /** 1 mentre si applicano modifiche ricevute: i trigger non le registrano come locali. */
  applying: integer('applying').notNull().default(0),
  folder: text('folder'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  intervalMinutes: integer('interval_minutes').notNull().default(5),
  /** syncId della cartella a cui il dispositivo è collegato (persona-sync.json). */
  syncSetId: text('sync_set_id'),
  /** Chiave derivata dalla passphrase (base64). Resta sul dispositivo; mai restituita dalle API. */
  encryptionKey: text('encryption_key'),
  /** Ultimo segmento scritto da questo dispositivo. */
  lastSeq: integer('last_seq').notNull().default(0),
  lastSyncAt: text('last_sync_at'),
  /** JSON { code, message } | null */
  lastError: text('last_error'),
  /** JSON SyncRunResult | null */
  lastResult: text('last_result'),
  /** Ultima volta in cui sono arrivate modifiche da altri dispositivi. */
  lastImportAt: text('last_import_at'),
});

/**
 * Versione di ogni riga sincronizzabile: `at` (millisecondi, orologio ibrido) e `dev` decidono
 * quale modifica prevale (l'ultima). `dirty` = modifica locale non ancora inviata; `deleted` = lapide.
 */
export const syncRowVersions = sqliteTable(
  'sync_row_versions',
  {
    tbl: text('tbl').notNull(),
    rowId: text('row_id').notNull(),
    at: integer('at').notNull(),
    dev: text('dev').notNull(),
    dirty: integer('dirty').notNull().default(1),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tbl, t.rowId] }), index('sync_row_versions_dirty_idx').on(t.dirty)],
);

/** Altri dispositivi visti nella cartella condivisa e fin dove sono state applicate le loro modifiche. */
export const syncPeers = sqliteTable('sync_peers', {
  deviceId: text('device_id').primaryKey(),
  name: text('name'),
  appVersion: text('app_version'),
  /** Ultimo segmento applicato. */
  appliedSeq: integer('applied_seq').notNull().default(0),
  /** Ultimo segmento pubblicato dal dispositivo (dal suo device.json). */
  lastSeq: integer('last_seq').notNull().default(0),
  lastSeenAt: text('last_seen_at'),
  /** null | newer_version | gap | unreadable */
  blocked: text('blocked'),
});

/** Modifiche ricevute in attesa di una riga a cui fanno riferimento (es. scenario prima del progetto). */
export const syncPending = sqliteTable(
  'sync_pending',
  {
    tbl: text('tbl').notNull(),
    rowId: text('row_id').notNull(),
    at: integer('at').notNull(),
    dev: text('dev').notNull(),
    /** JSON delle colonne */
    data: text('data').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tbl, t.rowId] })],
);
