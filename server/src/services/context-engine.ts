/**
 * Motore di contesto: ricostruisce a ogni richiesta il contesto del personaggio a partire
 * dai dati persistenti di PERSONA, entro un budget di token configurabile.
 *
 * Ordine: istruzioni di sistema → identità canonica (+ memorie core) → personalità →
 * comunicazione → competenze → profilo linguistico/lingua di risposta → modalità →
 * contesto di scenario → memorie recuperate → conoscenza → riassunto → estratti →
 * direzione dell'autore → cronologia recente → ultimo messaggio.
 */
import type { Character, ContextMeta, ContextSectionMeta, DialogueMode, ProviderType, ScenarioDetail, TurnSelectionMeta } from '@persona/shared';
import { estimateTokens, truncateToTokens } from '@persona/shared';
import type { AppContext } from '../context.js';
import type { ChatMessage } from '../llm/types.js';
import { preview } from '../lib/util.js';
import { getCharacter } from './characters.js';
import { type ConversationRow, latestSummary, type MessageRow } from './conversations.js';
import { getPreferences } from './preferences.js';
import {
  analysisInstructions,
  communicationSection,
  dataBlock,
  directiveSection,
  excerptsSection,
  expertiseSection,
  formatMemoryLine,
  identitySection,
  instructionsSection,
  knowledgeSection,
  languageSection,
  memoriesSection,
  modeSection,
  personalitySection,
  scenarioSection,
  summarySection,
} from './prompts.js';
import { embedQuery } from './embeddings.js';
import { coreMemories, searchExcerpts, searchKnowledge, searchScopedMemories, type SemanticQuery, touchMemories } from './retrieval.js';
import { getScenario } from './scenarios.js';

export interface EngineInfo {
  providerType: ProviderType;
  model: string;
  contextLength: number;
  maxTokens: number;
}

export interface AssembleInput {
  conversation: ConversationRow;
  speakerId: string;
  mode: DialogueMode;
  /** 'auto' oppure codice lingua. */
  responseLanguage: string;
  /** Cronologia attiva fino al punto di generazione (esclusa la risposta da generare). */
  history: MessageRow[];
  directive?: string | null;
  engine: EngineInfo;
  /** Aggiorna le statistiche di recupero delle memorie usate. */
  touch?: boolean;
  /** Come è stato scelto il parlante (simulazioni). */
  turnSelection?: TurnSelectionMeta | null;
}

export interface AssembledContext {
  messages: ChatMessage[];
  meta: ContextMeta;
}

type Kind = 'lab' | 'scenario' | 'simulation';

/** Il messaggio fa parte della simulazione "in personaggio"? (le analisi esterne no) */
export function isInCharacter(m: MessageRow): boolean {
  if (m.role === 'analysis') return false;
  if (m.role === 'author' && m.mode === 'analysis') return false;
  return true;
}

/** Rende un messaggio dal punto di vista del personaggio che parla. */
export function renderForSpeaker(m: MessageRow, speakerId: string, kind: Kind): ChatMessage | null {
  if (!isInCharacter(m)) return null;
  switch (m.role) {
    case 'character':
      return m.characterId === speakerId
        ? { role: 'assistant', content: m.content }
        : { role: 'user', content: `[${m.speakerName ?? '?'}]: ${m.content}` };
    case 'author':
      return { role: 'user', content: kind === 'lab' ? m.content : `[Author]: ${m.content}` };
    case 'narrator':
      return { role: 'user', content: `[Narration] ${m.content}` };
    default:
      return null;
  }
}

function transcriptLine(m: MessageRow): string {
  const who = m.role === 'author' ? 'Author' : m.role === 'narrator' ? 'Narration' : (m.speakerName ?? '?');
  return `[${who}]: ${m.content}`;
}

/** Unisce i turni consecutivi dello stesso ruolo e garantisce l'alternanza richiesta da molti template. */
export function normalizeTurns(turns: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of turns) {
    const last = out.at(-1);
    if (last && last.role === t.role) last.content += `\n\n${t.content}`;
    else out.push({ ...t });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '[The conversation begins.]' });
  return out;
}

class Budget {
  readonly sections: ContextSectionMeta[] = [];
  used = 0;
  constructor(readonly total: number) {}
  add(key: string, text: string | null, extra: Partial<ContextSectionMeta> = {}): string | null {
    if (!text) return null;
    const tokens = estimateTokens(text);
    this.used += tokens;
    this.sections.push({ key, tokens, ...extra });
    return text;
  }
  get remaining() {
    return Math.max(0, this.total - this.used);
  }
}

export async function assembleContext(ctx: AppContext, input: AssembleInput): Promise<AssembledContext> {
  const prefs = getPreferences(ctx).context;
  const { conversation, engine } = input;
  const kind = conversation.kind as Kind;
  const character = getCharacter(ctx, input.speakerId);
  const scenario = conversation.scenarioId ? getScenario(ctx, conversation.scenarioId) : null;
  const scope = { characterId: character.id, scenarioId: conversation.scenarioId };

  // Budget di input: contesto del modello meno output riservato e margine di sicurezza.
  const inputBudget = Math.max(768, engine.contextLength - engine.maxTokens - Math.ceil(engine.contextLength * 0.05));
  const budget = new Budget(inputBudget);
  const meta: ContextMeta = {
    purpose: input.mode === 'analysis' ? 'analysis' : 'character',
    speakerId: character.id,
    providerType: engine.providerType,
    model: engine.model,
    contextLength: engine.contextLength,
    maxOutputTokens: engine.maxTokens,
    promptTokens: 0,
    responseLanguage: input.responseLanguage,
    mode: input.mode,
    sections: budget.sections,
    memories: [],
    knowledge: [],
    excerpts: [],
    summaryId: null,
    historyIncluded: 0,
    historyOmitted: 0,
    directive: input.directive ?? null,
    retrieval: { mode: 'lexical', embeddingModel: null, semanticError: null },
    turnSelection: input.turnSelection ?? null,
  };

  const inCharacter = input.history.filter(isInCharacter);
  const recentForQuery = (input.mode === 'analysis' ? input.history : inCharacter).slice(-3).map((m) => m.content);
  const queryText = [...recentForQuery, input.directive ?? ''].join('\n');

  // Recupero ibrido facoltativo: embedding della query (fallback silenzioso al lessicale).
  let semantic: SemanticQuery | null = null;
  const q = await embedQuery(ctx, queryText);
  if (q.vector && q.model) {
    semantic = { vector: q.vector, model: q.model, weight: getPreferences(ctx).embeddings.semanticWeight };
    meta.retrieval = { mode: 'hybrid', embeddingModel: q.model, semanticError: null };
  } else if (q.error) {
    meta.retrieval.semanticError = q.error;
  }

  const memoryBudget = Math.floor(inputBudget * prefs.memoryRatio);
  const coreBudget = Math.floor(memoryBudget * 0.5);

  // --- Memorie core (parte dell'identità) ---
  const coreLines: string[] = [];
  let coreTokens = 0;
  for (const m of coreMemories(ctx, character.id)) {
    const l = formatMemoryLine(m);
    const t = estimateTokens(l);
    if (coreTokens + t > coreBudget) break;
    coreLines.push(l);
    coreTokens += t;
    meta.memories.push({ id: m.id, category: m.category, score: 1, tokens: t, preview: preview(m.content) });
  }

  const system: string[] = [];
  const push = (key: string, text: string | null, extra?: Partial<ContextSectionMeta>) => {
    const t = budget.add(key, text, extra);
    if (t) system.push(t);
  };

  // --- Identità: tronca la biografia se occupa troppo spazio ---
  let identityChar: Character = character;
  const identityCap = Math.floor(inputBudget * 0.35);
  let identityText = identitySection(character, coreLines);
  let identityTruncated = false;
  if (estimateTokens(identityText) > identityCap && character.biography) {
    const over = estimateTokens(identityText) - identityCap;
    const bio = truncateToTokens(character.biography, Math.max(200, estimateTokens(character.biography) - over));
    identityChar = { ...character, biography: bio.text };
    identityText = identitySection(identityChar, coreLines);
    identityTruncated = bio.truncated;
  }

  if (input.mode === 'analysis') {
    push('instructions', analysisInstructions(character, input.responseLanguage));
    push('identity', identityText, { items: coreLines.length, truncated: identityTruncated });
    push('personality', personalitySection(character));
    push('communication', communicationSection(character));
    push('expertise', expertiseSection(character));
    push('language', languageSection(character, input.responseLanguage).replace(/^Respond in:.*$/m, '').trim());
    if (scenario) push('scenario', scenarioContext(character, scenario));
  } else {
    push('instructions', instructionsSection(character, kind));
    push('identity', identityText, { items: coreLines.length, truncated: identityTruncated });
    push('personality', personalitySection(character));
    push('communication', communicationSection(character));
    push('expertise', expertiseSection(character));
    push('language', languageSection(character, input.responseLanguage));
    push('mode', modeSection(character, input.mode === 'interview' ? 'interview' : 'dialogue', kind));
    if (scenario) push('scenario', scenarioContext(character, scenario));
  }

  // --- Memorie recuperate per pertinenza (nel perimetro consentito) ---
  const otherBudget = memoryBudget - coreTokens;
  const memLines: string[] = [];
  let memTokens = 0;
  for (const m of searchScopedMemories(ctx, scope, queryText, 60, semantic)) {
    if (meta.memories.length >= prefs.maxMemories) break;
    const l = formatMemoryLine(m, scenario?.title);
    const t = estimateTokens(l);
    if (memTokens + t > otherBudget) continue;
    memLines.push(l);
    memTokens += t;
    meta.memories.push({
      id: m.id,
      category: m.category,
      score: Number(m.score.toFixed(3)),
      ...(m.semantic !== undefined ? { semantic: Number(m.semantic.toFixed(3)) } : {}),
      tokens: t,
      preview: preview(m.content),
    });
  }
  if (memLines.length) push('memories', memoriesSection(memLines), { items: memLines.length });

  // --- Base di conoscenza ---
  const kBudget = Math.floor(inputBudget * prefs.knowledgeRatio);
  const kBlocks: string[] = [];
  let kTokens = 0;
  for (const hit of searchKnowledge(ctx, character.id, queryText, prefs.maxKnowledgeChunks, semantic)) {
    const block = `[Source: ${hit.title}${hit.sourceRef ? ` — ${hit.sourceRef}` : ''} | status: ${hit.epistemicStatus}]\n${hit.content}`;
    const t = estimateTokens(block);
    if (kTokens + t > kBudget) continue;
    kBlocks.push(block);
    kTokens += t;
    meta.knowledge.push({ chunkId: hit.chunkId, sourceId: hit.sourceId, title: hit.title, score: Number(hit.score.toFixed(3)) });
  }
  if (kBlocks.length) push('knowledge', knowledgeSection(kBlocks), { items: kBlocks.length });

  // --- Riassunto incrementale della conversazione corrente ---
  const summary = latestSummary(ctx, conversation.id);
  let summarizedUpTo = 0;
  if (summary) {
    const sBudget = Math.floor(inputBudget * prefs.summaryRatio);
    const s = truncateToTokens(summary.content, sBudget);
    push('summary', summarySection(s.text), { truncated: s.truncated });
    meta.summaryId = summary.id;
    summarizedUpTo = summary.toSeq;
  }

  // --- Estratti da conversazioni precedenti (stesso perimetro) ---
  if (prefs.includeExcerpts && prefs.maxExcerpts > 0) {
    const eBudget = Math.floor(inputBudget * prefs.excerptRatio);
    const lines: string[] = [];
    let eTokens = 0;
    for (const ex of searchExcerpts(ctx, scope, conversation.id, queryText, prefs.maxExcerpts)) {
      const who = ex.role === 'author' ? 'Author' : ex.role === 'narrator' ? 'Narration' : (ex.speakerName ?? '?');
      const l = `- (${ex.createdAt.slice(0, 10)}, «${ex.conversationTitle}») [${who}]: ${preview(ex.content, 500)}`;
      const t = estimateTokens(l);
      if (eTokens + t > eBudget) continue;
      lines.push(l);
      eTokens += t;
      meta.excerpts.push({ messageId: ex.messageId, conversationId: ex.conversationId, score: Number(ex.score.toFixed(3)) });
    }
    if (lines.length) push('excerpts', excerptsSection(character.name, lines), { items: lines.length });
  }

  if (input.directive) push('directive', directiveSection(input.directive));

  // --- Cronologia recente (dopo il riassunto), dal più recente al più vecchio ---
  const systemText = system.join('\n\n');
  const unsummarized = input.history.filter((m) => m.seq > summarizedUpTo);
  const turns: ChatMessage[] = [];
  let historyTokens = 0;
  let omitted = 0;

  if (input.mode === 'analysis') {
    // Trascrizione in-personaggio come dato + scambi di analisi come turni di chat.
    const transcriptMsgs = unsummarized.filter(isInCharacter);
    const analysisMsgs = unsummarized.filter((m) => !isInCharacter(m));
    const tBudget = Math.floor(budget.remaining * 0.6);
    const lines: string[] = [];
    for (let i = transcriptMsgs.length - 1; i >= 0; i--) {
      const l = transcriptLine(transcriptMsgs[i]);
      const t = estimateTokens(l);
      if (historyTokens + t > tBudget) {
        omitted += i + 1;
        break;
      }
      lines.unshift(l);
      historyTokens += t;
    }
    meta.historyIncluded += lines.length;
    if (lines.length) {
      const block = `# CONVERSATION TRANSCRIPT (generated statements, not canonical)\n${dataBlock('transcript', lines.join('\n'))}`;
      system.push(block);
      budget.add('history', block, { items: lines.length });
    }
    for (let i = analysisMsgs.length - 1; i >= 0; i--) {
      const m = analysisMsgs[i];
      const turn: ChatMessage = { role: m.role === 'analysis' ? 'assistant' : 'user', content: m.content };
      const t = estimateTokens(turn.content);
      if (turns.length > 0 && historyTokens + t > budget.remaining) {
        omitted += i + 1;
        break;
      }
      turns.unshift(turn);
      historyTokens += t;
    }
    meta.historyIncluded += turns.length;
  } else {
    const rendered = unsummarized
      .map((m) => renderForSpeaker(m, character.id, kind))
      .filter((t): t is ChatMessage => t !== null);
    const available = budget.remaining;
    for (let i = rendered.length - 1; i >= 0; i--) {
      const turn = rendered[i];
      let t = estimateTokens(turn.content);
      if (historyTokens + t > available) {
        if (turns.length === 0) {
          // Il messaggio più recente viene sempre incluso (eventualmente troncato).
          const cut = truncateToTokens(turn.content, Math.max(64, available));
          turns.unshift({ ...turn, content: cut.text });
          historyTokens += estimateTokens(cut.text);
          omitted += i;
        } else {
          omitted += i + 1;
        }
        break;
      }
      turns.unshift(turn);
      historyTokens += t;
      t = 0;
    }
    meta.historyIncluded = turns.length;
    budget.add('history', turns.map((t) => t.content).join('\n'), { items: turns.length });
  }
  meta.historyOmitted = omitted + (input.history.length - unsummarized.length);

  // Segnale di turno: necessario quando l'ultimo turno è del personaggio stesso o nelle scene.
  const normalized = normalizeTurns(turns);
  const last = normalized.at(-1);
  if (input.mode !== 'analysis') {
    if (normalized.length === 0) {
      normalized.push({
        role: 'user',
        content: kind === 'lab' ? '[The author is waiting for you to speak.]' : `[The scene begins. It is ${character.name}'s turn to speak.]`,
      });
    } else if (last?.role === 'assistant') {
      normalized.push({ role: 'user', content: `[It is ${character.name}'s turn again: continue.]` });
    } else if (kind === 'simulation' && last) {
      last.content += `\n\n[It is now ${character.name}'s turn to speak.]`;
    }
  }

  const finalSystem = system.join('\n\n') || systemText;
  const messagesOut: ChatMessage[] = [{ role: 'system', content: finalSystem }, ...normalized];
  meta.promptTokens = messagesOut.reduce((n, m) => n + estimateTokens(m.content) + 4, 0);

  if (input.touch) touchMemories(ctx, meta.memories.map((m) => m.id));
  return { messages: messagesOut, meta };
}

function scenarioContext(character: Character, scenario: ScenarioDetail): string {
  const self = scenario.participants.find((p) => p.characterId === character.id) ?? null;
  const others = scenario.participants
    .filter((p) => p.characterId !== character.id)
    .map((p) => ({ name: p.characterName, role: p.role, occupation: null }));
  return scenarioSection(character, scenario, self, others);
}
