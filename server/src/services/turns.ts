/**
 * Gestione dei turni nelle simulazioni multi-personaggio.
 * - manual: sceglie l'autore;
 * - round-robin: partecipante successivo all'ultimo che ha parlato;
 * - auto: un prompt di "regia" chiede al modello chi dovrebbe parlare; in caso di
 *   risposta non valida o errore si ripiega sulla rotazione (nessun blocco della scena).
 */
import type { TurnSelectionMeta } from '@persona/shared';
import type { AppContext } from '../context.js';
import { collectChat } from '../llm/types.js';
import { preview } from '../lib/util.js';
import { getCharacter } from './characters.js';
import { isInCharacter } from './context-engine.js';
import { activeMessages, type ConversationRow, participantIds } from './conversations.js';
import { parseJsonBlock } from './memory.js';
import { resolveEngine } from './model-configs.js';
import { turnSelectionPrompt } from './prompts.js';
import { getScenario } from './scenarios.js';

export function nextSpeaker(ctx: AppContext, conv: ConversationRow): string | null {
  const ids = participantIds(ctx, conv.id);
  if (ids.length === 0) return null;
  const lastSpeaker = [...activeMessages(ctx, conv.id)].reverse().find((m) => m.role === 'character')?.characterId;
  const idx = lastSpeaker ? ids.indexOf(lastSpeaker) : -1;
  return ids[(idx + 1) % ids.length];
}

export interface SpeakerChoice {
  speakerId: string;
  selection: TurnSelectionMeta;
}

export async function selectSpeaker(ctx: AppContext, conv: ConversationRow, signal?: AbortSignal): Promise<SpeakerChoice | null> {
  const ids = participantIds(ctx, conv.id);
  if (ids.length === 0) return null;
  const fallback = (reason: string | null): SpeakerChoice => ({
    speakerId: nextSpeaker(ctx, conv)!,
    selection: { mode: conv.turnMode === 'auto' ? 'auto' : 'round-robin', reason },
  });
  if (conv.turnMode !== 'auto' || ids.length === 1) return fallback(null);

  try {
    const scenario = conv.scenarioId ? getScenario(ctx, conv.scenarioId) : null;
    const characters = ids.map((id) => getCharacter(ctx, id));
    const history = activeMessages(ctx, conv.id).filter((m) => isInCharacter(m) && m.status === 'complete');
    const lastSpeakerId = [...history].reverse().find((m) => m.role === 'character')?.characterId ?? null;
    const transcript = history.slice(-12).map((m) => {
      const who = m.role === 'author' ? 'Author' : m.role === 'narrator' ? 'Narration' : (m.speakerName ?? '?');
      return `[${who}]: ${preview(m.content, 600)}`;
    });
    const engine = await resolveEngine(ctx, characters[0].modelConfigId, signal);
    const res = await collectChat(
      engine.provider,
      turnSelectionPrompt({
        scenarioTitle: scenario?.title ?? conv.title,
        situation: scenario?.currentSituation ?? scenario?.initialSituation ?? null,
        participants: characters.map((c) => {
          const p = scenario?.participants.find((x) => x.characterId === c.id);
          return {
            name: c.name,
            role: p?.role ?? c.occupation,
            objectives: p?.objectives ?? null,
            traits: c.traits.filter((t) => t.category === 'personality' || t.category === 'motivation').map((t) => t.content).slice(0, 4),
          };
        }),
        lastSpeaker: characters.find((c) => c.id === lastSpeakerId)?.name ?? null,
        transcript,
      }),
      { model: engine.model, temperature: 0.2, maxTokens: 120, purpose: 'turn' },
      signal,
    );
    const parsed = parseJsonBlock<{ speaker?: string; reason?: string }>(res.content);
    const wanted = (parsed?.speaker ?? res.content).trim().toLowerCase();
    const match =
      characters.find((c) => c.name.toLowerCase() === wanted) ??
      characters.find((c) => wanted && (wanted.includes(c.name.toLowerCase()) || c.name.toLowerCase().startsWith(wanted)));
    if (!match) return fallback('fallback: invalid director answer');
    return { speakerId: match.id, selection: { mode: 'auto', reason: parsed?.reason?.slice(0, 300) ?? null } };
  } catch (err) {
    if (signal?.aborted) throw err;
    ctx.log.warn({ err: (err as Error).message, conversationId: conv.id }, 'automatic turn selection failed');
    return fallback(`fallback: ${(err as Error).message.slice(0, 200)}`);
  }
}
