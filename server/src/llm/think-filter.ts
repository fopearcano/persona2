import type { ChatChunk } from './types.js';

const OPEN = '<think>';
const CLOSE = '</think>';

/**
 * Separa in streaming i blocchi di ragionamento `<think>…</think>` (emessi da
 * alcuni modelli locali) dal testo della risposta. Gestisce tag spezzati tra chunk.
 */
export class ThinkFilter {
  private buffer = '';
  private inThink = false;

  push(text: string): ChatChunk[] {
    this.buffer += text;
    const out: ChatChunk[] = [];
    for (;;) {
      const tag = this.inThink ? CLOSE : OPEN;
      const idx = this.buffer.indexOf(tag);
      if (idx >= 0) {
        const before = this.buffer.slice(0, idx);
        if (before) out.push({ type: this.inThink ? 'reasoning' : 'content', text: before });
        this.buffer = this.buffer.slice(idx + tag.length);
        this.inThink = !this.inThink;
        continue;
      }
      // Trattieni un eventuale prefisso parziale del tag alla fine del buffer.
      let keep = 0;
      for (let k = Math.min(tag.length - 1, this.buffer.length); k > 0; k--) {
        if (tag.startsWith(this.buffer.slice(-k))) {
          keep = k;
          break;
        }
      }
      const emit = this.buffer.slice(0, this.buffer.length - keep);
      if (emit) out.push({ type: this.inThink ? 'reasoning' : 'content', text: emit });
      this.buffer = this.buffer.slice(this.buffer.length - keep);
      return out;
    }
  }

  flush(): ChatChunk[] {
    const rest = this.buffer;
    this.buffer = '';
    return rest ? [{ type: this.inThink ? 'reasoning' : 'content', text: rest }] : [];
  }
}
