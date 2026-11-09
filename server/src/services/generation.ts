/**
 * Orchestrazione della generazione:
 * identità → recupero memorie → assemblaggio contesto → adattatore LLM →
 * risposta in streaming → salvataggio → elaborazione controllata della memoria.
 */
import type { ErrorCode, StreamEvent, TurnSelectionMeta } from '@persona/shared';
import { regenerateSchema, sendMessageSchema, turnSchema } from '@persona/shared';
import type { AppContext } from '../context.js';
import { trackBackground } from '../context.js';
import { LlmError } from '../llm/types.js';
import { AppError, validate } from '../lib/util.js';
import { getCharacter } from './characters.js';
import { assembleContext } from './context-engine.js';
import {
  activeMessages,
  type ConversationRow,
  finalizeMessage,
  getConversationRow,
  getMessageRow,
  insertMessage,
  type MessageRow,
  participantIds,
  toMessage,
} from './conversations.js';
import { maybeAutoTitle, scheduleMemoryProcessing } from './memory-processing.js';
import { resolveEngine } from './model-configs.js';
import { selectSpeaker } from './turns.js';

export interface StreamSink {
  send(event: StreamEvent): void;
}

const busy = new Set<string>();

function lock(conversationId: string): () => void {
  if (busy.has(conversationId)) throw new AppError('busy', 'È già in corso una generazione per questa conversazione', 409);
  busy.add(conversationId);
  return () => busy.delete(conversationId);
}

export function isGenerating(conversationId: string): boolean {
  return busy.has(conversationId);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rimuove il prefisso "Nome:" che alcuni modelli aggiungono alla propria battuta. */
export function stripSpeakerPrefix(text: string, name: string): string {
  const re = new RegExp(`^\\s*(\\*\\*)?\\[?${escapeRegex(name)}\\]?(\\*\\*)?\\s*:\\s*`, 'i');
  return text.replace(re, '').trim();
}

function errorPayload(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof LlmError) return { code: err.code, message: err.message };
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: 'internal', message: (err as Error)?.message ?? String(err) };
}

interface TurnOptions {
  speakerId: string;
  mode: MessageRow['mode'] & ('dialogue' | 'interview' | 'analysis');
  language?: string;
  directive?: string | null;
  regenerateOf?: MessageRow;
  turnSelection?: TurnSelectionMeta | null;
}

/** Genera un turno del personaggio indicato. Non lancia: gli errori vengono emessi come eventi. */
async function generateTurn(
  ctx: AppContext,
  conv: ConversationRow,
  opts: TurnOptions,
  sink: StreamSink,
  signal: AbortSignal,
): Promise<MessageRow | null> {
  let placeholder: MessageRow | null = null;
  let content = '';
  let reasoning = '';
  try {
    if (!participantIds(ctx, conv.id).includes(opts.speakerId)) {
      throw new AppError('validation', 'Il personaggio non partecipa a questa conversazione');
    }
    const character = getCharacter(ctx, opts.speakerId);
    const engine = await resolveEngine(ctx, character.modelConfigId, signal);
    const all = activeMessages(ctx, conv.id);
    const history = opts.regenerateOf ? all.filter((m) => m.seq < opts.regenerateOf!.seq) : all;
    const responseLanguage = opts.language ?? conv.language;
    const assembled = await assembleContext(ctx, {
      conversation: conv,
      speakerId: character.id,
      mode: opts.mode,
      responseLanguage,
      history,
      directive: opts.directive ?? null,
      engine: {
        providerType: engine.config.providerType as never,
        model: engine.model,
        contextLength: engine.config.contextLength,
        maxTokens: engine.config.maxTokens,
      },
      touch: true,
      turnSelection: opts.turnSelection ?? null,
    });
    const role = opts.mode === 'analysis' ? 'analysis' : 'character';
    placeholder = insertMessage(ctx, {
      conversationId: conv.id,
      seq: opts.regenerateOf?.seq,
      role,
      characterId: character.id,
      speakerName: character.name,
      content: '',
      mode: opts.mode,
      language: responseLanguage,
      status: 'incomplete',
      providerType: engine.config.providerType,
      model: engine.model,
      contextMeta: JSON.stringify(assembled.meta),
      regeneratedFromId: opts.regenerateOf?.id ?? null,
    });
    sink.send({ type: 'start', messageId: placeholder.id, characterId: character.id, speakerName: character.name, role });
    sink.send({ type: 'context', meta: assembled.meta });

    for await (const chunk of engine.provider.chatStream(
      assembled.messages,
      {
        model: engine.model,
        temperature: engine.config.temperature,
        topP: engine.config.topP,
        maxTokens: engine.config.maxTokens,
        purpose: opts.mode === 'analysis' ? 'analysis' : 'character',
      },
      signal,
    )) {
      if (chunk.type === 'content') {
        content += chunk.text;
        sink.send({ type: 'delta', text: chunk.text });
      } else {
        reasoning += chunk.text;
        sink.send({ type: 'reasoning', text: chunk.text });
      }
    }
    const finalText = role === 'character' ? stripSpeakerPrefix(content, character.name) : content.trim();
    if (!finalText) throw new LlmError('llm_bad_response', 'Il modello ha restituito una risposta vuota');
    const saved = finalizeMessage(ctx, placeholder.id, {
      content: finalText,
      reasoning: reasoning.trim() || null,
      status: 'complete',
    });
    if (opts.regenerateOf) finalizeMessage(ctx, opts.regenerateOf.id, { status: 'superseded' });
    sink.send({ type: 'done', message: toMessage(saved) });
    return saved;
  } catch (err) {
    const aborted = signal.aborted || (err instanceof LlmError && err.code === 'aborted');
    const payload = aborted ? { code: 'aborted' as const, message: 'Generazione interrotta' } : errorPayload(err);
    let saved: MessageRow | null = null;
    if (placeholder) {
      // Nessun dato viene perso: il testo parziale resta salvato come "incompleto".
      saved = finalizeMessage(ctx, placeholder.id, {
        content: content.trim(),
        reasoning: reasoning.trim() || null,
        status: content.trim() ? 'incomplete' : 'error',
      });
    }
    if (!aborted) ctx.log.warn({ err: payload, conversationId: conv.id }, 'generation failed');
    sink.send({ type: 'error', error: payload, message: saved ? toMessage(saved) : null });
    return null;
  }
}

function afterGeneration(ctx: AppContext, conversationId: string) {
  trackBackground(ctx, maybeAutoTitle(ctx, conversationId));
  scheduleMemoryProcessing(ctx, conversationId);
}

/** Messaggio dell'autore (o narrazione) con eventuale risposta del personaggio. */
export async function sendMessage(ctx: AppContext, conversationId: string, input: unknown, sink: StreamSink, signal: AbortSignal) {
  const data = validate(sendMessageSchema, input);
  const conv = getConversationRow(ctx, conversationId);
  const unlock = lock(conv.id);
  try {
    const mode = data.role === 'narrator' ? 'dialogue' : (data.mode ?? (conv.defaultMode as TurnOptions['mode']));
    const authorMsg = insertMessage(ctx, {
      conversationId: conv.id,
      role: data.role,
      content: data.content,
      mode,
      language: data.language ?? null,
    });
    sink.send({ type: 'author_message', message: toMessage(authorMsg) });

    let speakerId: string | null = null;
    let turnSelection: TurnSelectionMeta | null = null;
    if (data.respond) {
      if (conv.kind === 'simulation') {
        if (conv.turnMode !== 'manual') {
          const choice = await selectSpeaker(ctx, conv, signal);
          speakerId = choice?.speakerId ?? null;
          turnSelection = choice?.selection ?? null;
        }
      } else {
        speakerId = conv.characterId;
      }
    }
    if (speakerId) {
      const res = await generateTurn(ctx, conv, { speakerId, mode, language: data.language, turnSelection }, sink, signal);
      if (res) afterGeneration(ctx, conv.id);
    } else {
      scheduleMemoryProcessing(ctx, conv.id);
    }
  } finally {
    unlock();
  }
}

/** Turno di un personaggio scelto dall'autore (simulazioni) o successivo nella rotazione. */
export async function takeTurn(ctx: AppContext, conversationId: string, input: unknown, sink: StreamSink, signal: AbortSignal) {
  const data = validate(turnSchema, input);
  const conv = getConversationRow(ctx, conversationId);
  const unlock = lock(conv.id);
  try {
    let speakerId: string | null = data.characterId ?? null;
    let turnSelection: TurnSelectionMeta | null = data.characterId ? { mode: 'manual', reason: null } : null;
    if (!speakerId) {
      if (conv.kind === 'simulation') {
        const choice = await selectSpeaker(ctx, conv, signal);
        speakerId = choice?.speakerId ?? null;
        turnSelection = choice?.selection ?? null;
      } else {
        speakerId = conv.characterId;
      }
    }
    if (!speakerId) throw new AppError('validation', 'Nessun personaggio selezionato');
    const res = await generateTurn(
      ctx,
      conv,
      { speakerId, mode: 'dialogue', language: data.language, directive: data.directive, turnSelection },
      sink,
      signal,
    );
    if (res) afterGeneration(ctx, conv.id);
  } finally {
    unlock();
  }
}

/** Rigenera una risposta: la versione precedente resta conservata come "sostituita". */
export async function regenerate(ctx: AppContext, messageId: string, input: unknown, sink: StreamSink, signal: AbortSignal) {
  const data = validate(regenerateSchema, input);
  const msg = getMessageRow(ctx, messageId);
  if ((msg.role !== 'character' && msg.role !== 'analysis') || !msg.characterId) {
    throw new AppError('validation', 'Solo le risposte generate possono essere rigenerate');
  }
  if (msg.status === 'superseded') throw new AppError('conflict', 'Il messaggio è già stato sostituito', 409);
  const conv = getConversationRow(ctx, msg.conversationId);
  const unlock = lock(conv.id);
  try {
    const res = await generateTurn(
      ctx,
      conv,
      {
        speakerId: msg.characterId,
        mode: msg.mode as TurnOptions['mode'],
        language: data.language ?? msg.language ?? undefined,
        directive: data.directive,
        regenerateOf: msg,
      },
      sink,
      signal,
    );
    if (res) afterGeneration(ctx, conv.id);
  } finally {
    unlock();
  }
}

export { nextSpeaker } from './turns.js';
