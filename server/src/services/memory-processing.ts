/**
 * Elaborazione controllata della memoria:
 * 1. riassunti incrementali (cumulativi) che NON sostituiscono i messaggi originali;
 * 2. estrazione di memorie con provenienza, rispettando il perimetro:
 *    - laboratorio → episodiche/semantiche (le proposte "core" richiedono approvazione);
 *    - scenario/simulazione → SEMPRE contestuali allo scenario, mai identità permanente.
 */
import type { Character, MemoryCategory, MemoryProcessingResult } from '@persona/shared';
import { EPISTEMIC_STATUSES, estimateTokens } from '@persona/shared';
import { and, eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { trackBackground } from '../context.js';
import { conversations, conversationSummaries } from '../db/schema.js';
import { collectChat } from '../llm/types.js';
import { compactWhitespace, newId, nowIso } from '../lib/util.js';
import { getCharacter } from './characters.js';
import { isInCharacter } from './context-engine.js';
import {
  activeMessages,
  DEFAULT_TITLES,
  getConversation,
  getConversationRow,
  latestSummary,
  type MessageRow,
  participantIds,
} from './conversations.js';
import { insertMemory, parseJsonBlock } from './memory.js';
import { resolveEngine, type ResolvedEngine } from './model-configs.js';
import { getPreferences } from './preferences.js';
import { extractionPrompt, summarizePrompt, titlePrompt } from './prompts.js';
import { coreMemories, searchScopedMemories } from './retrieval.js';
import { getScenarioRow } from './scenarios.js';

const processing = new Set<string>();

function transcript(msgs: MessageRow[]): string {
  return msgs
    .map((m) => {
      const who = m.role === 'author' ? 'AUTHOR' : m.role === 'narrator' ? 'NARRATOR' : (m.speakerName ?? '?');
      return `[${who}]: ${m.content}`;
    })
    .join('\n');
}

/** Divide i messaggi in blocchi entro il budget di token. */
function chunkMessages(msgs: MessageRow[], maxTokens: number): MessageRow[][] {
  const chunks: MessageRow[][] = [];
  let current: MessageRow[] = [];
  let tokens = 0;
  for (const m of msgs) {
    const t = estimateTokens(m.content) + 6;
    if (current.length && tokens + t > maxTokens) {
      chunks.push(current);
      current = [];
      tokens = 0;
    }
    current.push(m);
    tokens += t;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function engineFor(ctx: AppContext, characterIds: string[]): Promise<ResolvedEngine> {
  const first = characterIds[0] ? getCharacter(ctx, characterIds[0]) : null;
  return resolveEngine(ctx, first?.modelConfigId ?? null);
}

const norm = (s: string) => compactWhitespace(s.toLowerCase());

async function extractFor(
  ctx: AppContext,
  engine: ResolvedEngine,
  character: Character,
  conv: { id: string; kind: string; scenarioId: string | null; language: string },
  chunk: MessageRow[],
  scenarioTitle: string | null,
  review: boolean,
) {
  const scope = { characterId: character.id, scenarioId: conv.scenarioId };
  const text = transcript(chunk);
  const existing = [
    ...coreMemories(ctx, character.id).map((m) => m.content),
    ...searchScopedMemories(ctx, scope, text, 30).map((m) => m.content),
  ];
  const res = await collectChat(engine.provider, extractionPrompt(character, { scenarioTitle }, existing.slice(0, 40), text), {
    model: engine.model,
    temperature: 0.2,
    maxTokens: Math.min(1200, engine.config.maxTokens * 2),
    purpose: 'extract',
  });
  const parsed = parseJsonBlock<{ memories?: unknown[] }>(res.content);
  const items = Array.isArray(parsed?.memories) ? parsed!.memories : [];
  const known = new Set(existing.map(norm));
  const created = [];
  for (const raw of items.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const content = typeof r.content === 'string' ? r.content.trim().slice(0, 2000) : '';
    if (!content || known.has(norm(content))) continue;
    known.add(norm(content));
    const proposed = String(r.category ?? 'semantic');
    const epistemic = EPISTEMIC_STATUSES.includes(r.epistemicStatus as never)
      ? (r.epistemicStatus as (typeof EPISTEMIC_STATUSES)[number])
      : 'unverified';
    const importance = Math.min(5, Math.max(1, Math.round(Number(r.importance) || 3)));
    let category: MemoryCategory;
    let status: 'active' | 'proposed';
    if (conv.scenarioId) {
      // Isolamento: tutto ciò che accade in uno scenario resta contestuale.
      category = 'contextual';
      status = review ? 'proposed' : 'active';
    } else if (proposed === 'core') {
      // Le modifiche all'identità permanente richiedono sempre l'approvazione dell'autore.
      category = 'core';
      status = 'proposed';
    } else {
      category = proposed === 'episodic' ? 'episodic' : 'semantic';
      status = review ? 'proposed' : 'active';
    }
    created.push(
      insertMemory(
        ctx,
        {
          characterId: character.id,
          category,
          scenarioId: conv.scenarioId,
          content,
          importance,
          epistemicStatus: conv.scenarioId && epistemic === 'fact' ? 'fiction' : epistemic,
          language: conv.language !== 'auto' ? conv.language : null,
          status,
          origin: 'extraction',
          pinned: false,
          promotedFromId: null,
        },
        {
          conversationId: conv.id,
          scenarioId: conv.scenarioId,
          fromSeq: chunk[0].seq,
          toSeq: chunk.at(-1)!.seq,
          note: `Estratta automaticamente (${engine.model})`,
        },
      ),
    );
  }
  return created;
}

/**
 * Elabora la memoria di una conversazione. `force` = elabora anche sotto soglia
 * (azione manuale dell'autore).
 */
export async function processConversationMemory(
  ctx: AppContext,
  conversationId: string,
  opts: { force: boolean },
): Promise<MemoryProcessingResult> {
  const result: MemoryProcessingResult = {
    conversationId,
    summaryCreated: null,
    memoriesCreated: [],
    skipped: false,
    reason: null,
  };
  if (processing.has(conversationId)) return { ...result, skipped: true, reason: 'busy' };
  processing.add(conversationId);
  try {
    const conv = getConversationRow(ctx, conversationId);
    const prefs = getPreferences(ctx).memory;
    const msgs = activeMessages(ctx, conv.id).filter((m) => isInCharacter(m) && m.status === 'complete');
    const unprocessed = msgs.filter((m) => m.seq > conv.memoryProcessedSeq);
    // I messaggi più recenti restano esclusi dal riassunto: sono inviati integralmente.
    const unsummarized = msgs.filter((m) => m.seq > conv.summarizedSeq);
    const toSummarize = unsummarized.slice(0, Math.max(0, unsummarized.length - prefs.keepRecentMessages));
    const threshold = opts.force ? 1 : prefs.processThreshold;
    if (unprocessed.length < threshold && toSummarize.length < (opts.force ? 2 : prefs.processThreshold)) {
      return { ...result, skipped: true, reason: 'below_threshold' };
    }
    const participants = participantIds(ctx, conv.id);
    const engine = await engineFor(ctx, participants);
    const chunkBudget = Math.max(800, Math.floor(engine.config.contextLength * 0.5) - 600);

    // 1. Riassunto incrementale cumulativo.
    if (toSummarize.length >= 2) {
      const prev = latestSummary(ctx, conv.id);
      let summaryText = prev?.content ?? null;
      let fromSeq = toSummarize[0].seq;
      let toSeq = fromSeq;
      for (const chunk of chunkMessages(toSummarize, chunkBudget)) {
        const res = await collectChat(engine.provider, summarizePrompt(summaryText, transcript(chunk), chunk[0].seq, chunk.at(-1)!.seq), {
          model: engine.model,
          temperature: 0.2,
          maxTokens: Math.min(900, Math.max(400, engine.config.maxTokens)),
          purpose: 'summarize',
        });
        if (!res.content) break;
        summaryText = res.content;
        toSeq = chunk.at(-1)!.seq;
      }
      if (summaryText && toSeq > conv.summarizedSeq) {
        const id = newId();
        const ts = nowIso();
        fromSeq = prev ? prev.fromSeq : fromSeq;
        ctx.dbm.db
          .insert(conversationSummaries)
          .values({ id, conversationId: conv.id, fromSeq, toSeq, content: summaryText, model: engine.model, createdAt: ts })
          .run();
        ctx.dbm.db.update(conversations).set({ summarizedSeq: toSeq }).where(eq(conversations.id, conv.id)).run();
        result.summaryCreated = { id, conversationId: conv.id, fromSeq, toSeq, content: summaryText, model: engine.model, createdAt: ts };
      }
    }

    // 2. Estrazione delle memorie, dal punto di vista di ciascun personaggio.
    if (unprocessed.length >= 1) {
      const scenarioTitle = conv.scenarioId ? getScenarioRow(ctx, conv.scenarioId).title : null;
      for (const chunk of chunkMessages(unprocessed, chunkBudget)) {
        for (const cid of participants) {
          const character = getCharacter(ctx, cid);
          result.memoriesCreated.push(
            ...(await extractFor(ctx, engine, character, conv, chunk, scenarioTitle, prefs.reviewExtracted)),
          );
        }
        ctx.dbm.db
          .update(conversations)
          .set({ memoryProcessedSeq: chunk.at(-1)!.seq })
          .where(and(eq(conversations.id, conv.id)))
          .run();
      }
    }
    return result;
  } finally {
    processing.delete(conversationId);
  }
}

/** Pianifica l'elaborazione automatica in background (se abilitata e sopra soglia). */
export function scheduleMemoryProcessing(ctx: AppContext, conversationId: string): void {
  if (!getPreferences(ctx).memory.autoProcess) return;
  const task = processConversationMemory(ctx, conversationId, { force: false }).catch((err) => {
    ctx.log.warn({ err: (err as Error).message, conversationId }, 'memory processing failed');
  });
  trackBackground(ctx, task);
}

/**
 * Quando si apre una nuova conversazione, elabora le conversazioni precedenti dello
 * stesso personaggio rimaste sotto soglia, così le nuove sessioni ne ereditano le memorie.
 */
export function processPendingFor(ctx: AppContext, characterId: string, exceptConversationId: string): void {
  if (!getPreferences(ctx).memory.autoProcess) return;
  const rows = ctx.dbm.sqlite
    .prepare(
      `SELECT c.id FROM conversations c
         JOIN conversation_participants p ON p.conversation_id = c.id AND p.character_id = ?
        WHERE c.id != ?
          AND (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.status = 'complete' AND m.seq > c.memory_processed_seq) >= 2
        ORDER BY c.updated_at DESC LIMIT 3`,
    )
    .all(characterId, exceptConversationId) as { id: string }[];
  for (const r of rows) {
    const task = processConversationMemory(ctx, r.id, { force: true }).catch((err) => {
      ctx.log.warn({ err: (err as Error).message, conversationId: r.id }, 'pending memory processing failed');
    });
    trackBackground(ctx, task);
  }
}

/** Titolo automatico dopo il primo scambio, se l'autore non ne ha dato uno. */
export async function maybeAutoTitle(ctx: AppContext, conversationId: string): Promise<void> {
  try {
    const conv = getConversation(ctx, conversationId);
    if (!DEFAULT_TITLES.has(conv.title)) return;
    const msgs = activeMessages(ctx, conversationId).filter((m) => isInCharacter(m) && m.status === 'complete');
    if (msgs.length < 2) return;
    const engine = await engineFor(ctx, conv.participantIds);
    const res = await collectChat(engine.provider, titlePrompt(transcript(msgs.slice(0, 6)).slice(0, 4000)), {
      model: engine.model,
      temperature: 0.3,
      maxTokens: 40,
      purpose: 'title',
    });
    const title = res.content.replace(/^["'«“]+|["'»”]+$/g, '').split('\n')[0].trim().slice(0, 120);
    if (title) {
      ctx.dbm.db.update(conversations).set({ title }).where(eq(conversations.id, conversationId)).run();
    }
  } catch (err) {
    ctx.log.warn({ err: (err as Error).message, conversationId }, 'auto title failed');
  }
}

