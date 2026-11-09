import type {
  CharacterStatus,
  ConversationKind,
  DialogueMode,
  EpistemicStatus,
  ErrorCode,
  ExpertiseLevel,
  MemoryCategory,
  MemoryOrigin,
  MemoryStatus,
  MessageRole,
  MessageStatus,
  ProficiencyLevel,
  ProjectStatus,
  ProviderType,
  ScenarioStatus,
  Theme,
  FontChoice,
  TextSize,
  AccentChoice,
  TraitCategory,
  TurnMode,
} from './constants.js';

/* ------------------------------------------------------------------ */
/* Personaggi                                                          */
/* ------------------------------------------------------------------ */

/** Big Five facoltativi (0–100). `null` = non specificato. Indicativi, non prescrittivi. */
export interface BigFive {
  openness: number | null;
  conscientiousness: number | null;
  extraversion: number | null;
  agreeableness: number | null;
  neuroticism: number | null;
}

export interface CharacterTrait {
  id: string;
  category: TraitCategory;
  content: string;
  sortOrder: number;
}

export interface CharacterLanguage {
  id: string;
  code: string;
  proficiency: ProficiencyLevel;
  isNative: boolean;
  notes: string | null;
  sortOrder: number;
}

export interface Expertise {
  id: string;
  domain: string;
  level: ExpertiseLevel;
  description: string | null;
  subtopics: string[];
  sortOrder: number;
}

/** Campi scalari dell'identità canonica. */
export interface CharacterProfileFields {
  name: string;
  age: string | null;
  origin: string | null;
  culturalBackground: string | null;
  occupation: string | null;
  education: string | null;
  biography: string | null;
  appearance: string | null;
  portrait: string | null;
  // Psicologia
  temperament: string | null;
  interpersonalStyle: string | null;
  conflictResponse: string | null;
  stressResponse: string | null;
  bigFive: BigFive | null;
  // Comunicazione
  register: string | null;
  vocabulary: string | null;
  formality: string | null;
  humor: string | null;
  assertiveness: string | null;
  argumentativeStyle: string | null;
  conversationalDepth: string | null;
  culturalLinguisticNotes: string | null;
  preferredLanguage: string | null;
  /** Note dell'autore: non vengono inviate al modello. */
  authorNotes: string | null;
}

export interface Character extends CharacterProfileFields {
  id: string;
  status: CharacterStatus;
  parentId: string | null;
  variantNote: string | null;
  modelConfigId: string | null;
  identityVersion: number;
  /** Progetti di cui il personaggio fa parte (appartenenza, non identità). */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
  traits: CharacterTrait[];
  languages: CharacterLanguage[];
  expertise: Expertise[];
}

export interface CharacterSummary {
  id: string;
  name: string;
  occupation: string | null;
  origin: string | null;
  portrait: string | null;
  status: CharacterStatus;
  parentId: string | null;
  variantNote: string | null;
  identityVersion: number;
  languages: { code: string; proficiency: ProficiencyLevel; isNative: boolean }[];
  expertiseDomains: string[];
  memoryCount: number;
  conversationCount: number;
  /** Progetti (storie) di cui il personaggio fa parte: la stessa identità può stare in più progetti. */
  projectIds: string[];
  updatedAt: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Progetti                                                            */
/* ------------------------------------------------------------------ */

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  characterCount: number;
  scenarioCount: number;
  simulationCount: number;
  lastActivityAt: string;
}

export interface IdentityRevision {
  id: string;
  characterId: string;
  version: number;
  reason: string | null;
  createdAt: string;
  snapshot: CharacterSnapshot;
}

/** Stato completo dell'identità in un dato momento (usato per revisioni ed export). */
export interface CharacterSnapshot extends CharacterProfileFields {
  traits: Omit<CharacterTrait, 'id'>[];
  languages: Omit<CharacterLanguage, 'id'>[];
  expertise: Omit<Expertise, 'id'>[];
}

/* ------------------------------------------------------------------ */
/* Conoscenza                                                          */
/* ------------------------------------------------------------------ */

export interface KnowledgeSource {
  id: string;
  characterId: string;
  title: string;
  kind: 'text' | 'markdown' | 'note';
  content: string;
  sourceRef: string | null;
  epistemicStatus: EpistemicStatus;
  language: string | null;
  enabled: boolean;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeHit {
  chunkId: string;
  sourceId: string;
  title: string;
  epistemicStatus: EpistemicStatus;
  sourceRef: string | null;
  content: string;
  score: number;
}

/* ------------------------------------------------------------------ */
/* Memoria                                                             */
/* ------------------------------------------------------------------ */

export interface MemorySource {
  id: string;
  memoryId: string;
  conversationId: string | null;
  messageId: string | null;
  scenarioId: string | null;
  fromSeq: number | null;
  toSeq: number | null;
  note: string | null;
  createdAt: string;
}

export interface Memory {
  id: string;
  characterId: string;
  category: MemoryCategory;
  scenarioId: string | null;
  content: string;
  importance: number;
  epistemicStatus: EpistemicStatus;
  language: string | null;
  status: MemoryStatus;
  origin: MemoryOrigin;
  pinned: boolean;
  promotedFromId: string | null;
  retrievalCount: number;
  lastRetrievedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sources: MemorySource[];
}

export interface MemoryConsistencyIssue {
  kind: 'duplicate' | 'fiction_in_core' | 'pending_proposals' | 'contradiction' | 'scope';
  severity: 'info' | 'warning';
  memoryIds: string[];
  detail: string;
}

export interface MemoryConsistencyReport {
  characterId: string;
  checkedAt: string;
  memoryCount: number;
  issues: MemoryConsistencyIssue[];
  /** true se è stata eseguita anche l'analisi semantica tramite LLM. */
  llmChecked: boolean;
  llmError: string | null;
}

/* ------------------------------------------------------------------ */
/* Conversazioni                                                       */
/* ------------------------------------------------------------------ */

export interface Conversation {
  id: string;
  kind: ConversationKind;
  characterId: string | null;
  scenarioId: string | null;
  title: string;
  language: string;
  defaultMode: DialogueMode;
  turnMode: TurnMode;
  archived: boolean;
  summarizedSeq: number;
  memoryProcessedSeq: number;
  participantIds: string[];
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContextSectionMeta {
  key: string;
  tokens: number;
  items?: number;
  truncated?: boolean;
}

export interface ContextMemoryMeta {
  id: string;
  category: MemoryCategory;
  score: number;
  /** Similarità semantica normalizzata (0–1), se il recupero ibrido è attivo. */
  semantic?: number;
  tokens: number;
  preview: string;
}

export interface RetrievalMeta {
  /** lexical = solo FTS5; hybrid = FTS5 + similarità tra embedding. */
  mode: 'lexical' | 'hybrid';
  embeddingModel: string | null;
  /** Motivo per cui il recupero semantico non è stato usato (errore del servizio di embedding). */
  semanticError: string | null;
}

export interface TurnSelectionMeta {
  mode: TurnMode;
  reason: string | null;
}

export interface ContextMeta {
  purpose: 'character' | 'analysis';
  speakerId: string | null;
  providerType: ProviderType;
  model: string;
  contextLength: number;
  maxOutputTokens: number;
  promptTokens: number;
  responseLanguage: string;
  mode: DialogueMode;
  sections: ContextSectionMeta[];
  memories: ContextMemoryMeta[];
  knowledge: { chunkId: string; sourceId: string; title: string; score: number }[];
  excerpts: { messageId: string; conversationId: string; score: number }[];
  summaryId: string | null;
  historyIncluded: number;
  historyOmitted: number;
  directive: string | null;
  retrieval: RetrievalMeta;
  turnSelection: TurnSelectionMeta | null;
}

export interface Message {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  characterId: string | null;
  speakerName: string | null;
  content: string;
  reasoning: string | null;
  mode: DialogueMode;
  language: string | null;
  status: MessageStatus;
  providerType: ProviderType | null;
  model: string | null;
  contextMeta: ContextMeta | null;
  regeneratedFromId: string | null;
  editedAt: string | null;
  createdAt: string;
}

export interface MessageRevision {
  id: string;
  messageId: string;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  fromSeq: number;
  toSeq: number;
  content: string;
  model: string | null;
  createdAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
  summaries: ConversationSummary[];
}

export interface MemoryProcessingResult {
  conversationId: string;
  summaryCreated: ConversationSummary | null;
  memoriesCreated: Memory[];
  skipped: boolean;
  reason: string | null;
}

/** Anteprima del contesto che verrebbe inviato al modello. */
export interface ContextPreview {
  meta: ContextMeta;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
}

/* ------------------------------------------------------------------ */
/* Scenari                                                             */
/* ------------------------------------------------------------------ */

export interface ScenarioParticipant {
  id: string;
  scenarioId: string;
  characterId: string;
  characterName: string;
  role: string | null;
  roleDescription: string | null;
  knowledge: string | null;
  objectives: string | null;
  sortOrder: number;
}

export interface ScenarioRelationship {
  id: string;
  scenarioId: string;
  fromCharacterId: string;
  toCharacterId: string;
  description: string;
}

export interface ScenarioEvent {
  id: string;
  scenarioId: string;
  title: string | null;
  content: string;
  fictionalTime: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Scenario {
  id: string;
  /** Progetto (storia) a cui appartiene lo scenario; null = non assegnato. */
  projectId: string | null;
  title: string;
  description: string | null;
  setting: string | null;
  timeline: string | null;
  environment: string | null;
  initialSituation: string | null;
  currentSituation: string | null;
  knowledge: string | null;
  language: string | null;
  status: ScenarioStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioDetail extends Scenario {
  participants: ScenarioParticipant[];
  relationships: ScenarioRelationship[];
  events: ScenarioEvent[];
}

export interface ScenarioSummary extends Scenario {
  participantCount: number;
  participantNames: string[];
  conversationCount: number;
}

/* ------------------------------------------------------------------ */
/* Modelli e preferenze                                                */
/* ------------------------------------------------------------------ */

export interface ModelConfig {
  id: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  /** Vuoto = usa il primo modello disponibile/caricato. */
  model: string;
  temperature: number;
  topP: number | null;
  maxTokens: number;
  contextLength: number;
  isDefault: boolean;
  /** La chiave non viene mai restituita al frontend. */
  hasApiKey: boolean;
  apiKeyFromEnv: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  loaded: boolean | null;
  contextLength: number | null;
  type: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  models: ModelInfo[];
  resolvedModel: string | null;
  modelAvailable: boolean;
  completionOk: boolean | null;
  sample: string | null;
  error: { code: ErrorCode; message: string } | null;
}

export interface MemoryPreferences {
  /** Elabora automaticamente riassunti e memorie dopo le risposte. */
  autoProcess: boolean;
  /** Numero di messaggi non elaborati che attiva l'elaborazione. */
  processThreshold: number;
  /** Messaggi recenti sempre esclusi dal riassunto (restano integrali nel contesto). */
  keepRecentMessages: number;
  /** Se true, anche le memorie episodiche/semantiche estratte richiedono approvazione. */
  reviewExtracted: boolean;
}

export interface ContextPreferences {
  /** Frazioni del budget di input destinate alle sezioni recuperate. */
  memoryRatio: number;
  knowledgeRatio: number;
  summaryRatio: number;
  excerptRatio: number;
  maxMemories: number;
  maxKnowledgeChunks: number;
  maxExcerpts: number;
  /** Includi estratti di conversazioni precedenti recuperati per pertinenza. */
  includeExcerpts: boolean;
}

export interface EmbeddingPreferences {
  /** Recupero semantico con embedding locali (affiancato a FTS5). */
  enabled: boolean;
  /** Configurazione da cui prendere endpoint e chiave (null = motore predefinito). */
  modelConfigId: string | null;
  /** Modello di embedding (es. un modello multilingue caricato in LM Studio). */
  model: string;
  /** Peso della similarità semantica rispetto a quella lessicale (0–1). */
  semanticWeight: number;
}

export interface AppearancePreferences {
  /** Carattere dell'interfaccia (menu, etichette, pulsanti). */
  fontUi: FontChoice;
  /** Carattere dei testi: conversazioni, campi di testo, memorie. */
  fontText: FontChoice;
  textSize: TextSize;
  accent: AccentChoice;
  /** Colore personalizzato (#rrggbb), usato quando accent = 'custom'. */
  accentCustom: string | null;
}

export interface Preferences {
  /** Progetto attivo nell'interfaccia (null = tutti i progetti). */
  activeProjectId: string | null;
  uiLanguage: string;
  theme: Theme;
  appearance: AppearancePreferences;
  conversationLanguage: string;
  defaultModelConfigId: string | null;
  memory: MemoryPreferences;
  context: ContextPreferences;
  embeddings: EmbeddingPreferences;
}

/** Disponibilità del motore LLM di un personaggio (verifica rapida, senza generazione). */
export interface EngineStatus {
  configId: string | null;
  configName: string | null;
  providerType: ProviderType | null;
  /** Modello che verrebbe usato (configurato o scelto automaticamente). */
  model: string | null;
  available: boolean;
  /** LM Studio: il modello è già caricato in memoria (null se non noto). */
  loaded: boolean | null;
  error: { code: ErrorCode; message: string } | null;
  checkedAt: string;
}

export interface EmbeddingStatus {
  enabled: boolean;
  model: string | null;
  memories: { indexed: number; total: number };
  chunks: { indexed: number; total: number };
  running: boolean;
  lastError: string | null;
  lastRunAt: string | null;
}

export interface EmbeddingTestResult {
  ok: boolean;
  model: string;
  dimensions: number | null;
  latencyMs: number;
  error: { code: ErrorCode; message: string } | null;
}

export interface PdfExtraction {
  title: string;
  pages: number;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Errori e streaming                                                  */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export type StreamEvent =
  | { type: 'author_message'; message: Message }
  | { type: 'start'; messageId: string; characterId: string | null; speakerName: string | null; role: MessageRole }
  | { type: 'context'; meta: ContextMeta }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; error: { code: ErrorCode; message: string }; message: Message | null };

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AppInfo {
  name: string;
  version: string;
  dataDir: string;
  databaseFile: string;
  schemaVersion: number;
  stats: {
    characters: number;
    memories: number;
    conversations: number;
    messages: number;
    scenarios: number;
  };
}
