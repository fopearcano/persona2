import type { ModelInfo } from '@persona/shared';
import { type ChatChunk, type ChatMessage, type InferenceParams, LlmError, type LlmProvider } from './types.js';

/**
 * Provider deterministico per test automatici e uso dimostrativo offline.
 * Non è un modello linguistico: produce risposte segnaposto ricavate dal contesto
 * (utile per verificare l'assemblaggio del contesto senza LM Studio).
 */
export class MockProvider implements LlmProvider {
  readonly type = 'mock' as const;

  constructor(private readonly delayMs = 0) {}

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'mock-persona', loaded: true, contextLength: 32768, type: 'llm' },
      { id: 'mock-fail', loaded: true, contextLength: 8192, type: 'llm' },
      { id: 'mock-slow', loaded: true, contextLength: 8192, type: 'llm' },
      { id: 'mock-embed', loaded: true, contextLength: 2048, type: 'embeddings' },
    ];
  }

  /**
   * Embedding deterministico: "bag of words" con hashing, più un piccolo dizionario di
   * concetti multilingue usato nei test per simulare il recupero cross-lingua.
   * NON è un modello semantico.
   */
  async embed(texts: string[], model: string): Promise<number[][]> {
    if (model.includes('fail')) throw new LlmError('llm_unavailable', 'Provider mock: embedding non disponibile');
    return texts.map((t) => mockVector(t));
  }

  private respond(messages: ChatMessage[], params: InferenceParams): string {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const lastUser = ([...messages].reverse().find((m) => m.role === 'user')?.content ?? '').replace(/<\/?data[^>]*>/g, '').trim();
    const firstWords = (text: string, n: number) => text.replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
    switch (params.purpose) {
      case 'test':
        return 'OK';
      case 'title':
        return `Conversazione: ${firstWords(lastUser.replace(/^\[[^\]]+\]:\s*/, ''), 5)}`;
      case 'summarize':
        return `Riassunto simulato. ${firstWords(lastUser, 40)}`;
      case 'consistency':
        return JSON.stringify({ issues: [] });
      case 'turn': {
        // Sceglie il partecipante nominato nell'ultima battuta (diverso dall'ultimo a parlare), altrimenti il primo disponibile.
        const names = [...lastUser.matchAll(/^- (.+?) \|/gm)].map((m) => m[1].trim());
        const lastSpeaker = lastUser.match(/^LAST SPEAKER: (.+)$/m)?.[1]?.trim() ?? '';
        const lastLine = lastUser.split('\n').filter((l) => l.startsWith('[')).at(-1) ?? '';
        const candidates = names.filter((n) => n !== lastSpeaker);
        const addressed = candidates.find((n) => lastLine.toLowerCase().includes(n.split(' ')[0].toLowerCase()));
        const speaker = addressed ?? candidates[0] ?? names[0] ?? '';
        return JSON.stringify({ speaker, reason: addressed ? 'addressed in the last line' : 'next available participant' });
      }
      case 'extract': {
        const lines = lastUser.split('\n').filter((l) => /^\[(AUTHOR|AUTORE|NARRATOR)/i.test(l));
        const source = lines.at(-1)?.replace(/^\[[^\]]+\]:?\s*/, '') ?? firstWords(lastUser, 12);
        return JSON.stringify({
          memories: [
            {
              content: `Mock: si è parlato di «${firstWords(source, 12)}»`,
              category: 'semantic',
              importance: 3,
              epistemicStatus: 'fact',
            },
          ],
        });
      }
      default: {
        const name = system.match(/^Name: (.+)$/m)?.[1]?.trim() ?? 'Personaggio';
        const lang = system.match(/^Respond in: .*\(([A-Za-z-]+)\)/m)?.[1] ?? 'auto';
        const memoryCount = (system.match(/^- \[mem /gm) ?? []).length;
        const prefix = params.purpose === 'analysis' ? `[analisi esterna su ${name}]` : `[${name}]`;
        return `${prefix} Risposta simulata (lingua: ${lang}; memorie nel contesto: ${memoryCount}). Hai detto: «${firstWords(lastUser, 20)}».`;
      }
    }
  }

  async *chatStream(messages: ChatMessage[], params: InferenceParams, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    if (params.model === 'mock-fail') throw new LlmError('llm_unavailable', 'Provider mock: errore simulato');
    const text = this.respond(messages, params);
    const delay = params.model === 'mock-slow' ? Math.max(this.delayMs, 200) : this.delayMs;
    const parts = text.match(/\S+\s*/g) ?? [text];
    for (const part of parts) {
      if (signal?.aborted) throw new LlmError('aborted', 'Richiesta annullata');
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      yield { type: 'content', text: part };
    }
  }
}

const CONCEPTS: [string, string[]][] = [
  ['star', ['stell', 'star', 'звезд', 'étoil', 'etoil', 'estrell', 'stern']],
  ['explode', ['esplo', 'explod', 'взорв', 'взрыв', 'explos']],
  ['supernova', ['supernov', 'сверхнов']],
  ['telescope', ['telescop', 'телескоп', 'teleskop']],
  ['cat', ['gatt', 'cat', 'кошк', 'кот', 'chat', 'katz']],
  ['father', ['padr', 'father', 'отец', 'отца', 'père', 'vater']],
];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619);
  return h >>> 0;
}

export function mockVector(text: string, dims = 96): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (w.length < 3) continue;
    const concept = CONCEPTS.find(([, stems]) => stems.some((s) => w.startsWith(s)))?.[0];
    v[hash(concept ? `concept:${concept}` : w) % dims] += concept ? 3 : 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
