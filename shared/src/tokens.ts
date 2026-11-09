/**
 * Stima approssimativa dei token, indipendente dal tokenizer del modello.
 * Prudente: ~3.5 caratteri per token per gli alfabeti latini/cirillici,
 * ~1 token per carattere per CJK. Serve solo a dimensionare i budget di contesto.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  let cjk = 0;
  let total = 0;
  for (const ch of text) {
    total++;
    const c = ch.codePointAt(0) ?? 0;
    if (
      (c >= 0x3040 && c <= 0x30ff) ||
      (c >= 0x3400 && c <= 0x9fff) ||
      (c >= 0xac00 && c <= 0xd7af) ||
      (c >= 0xf900 && c <= 0xfaff)
    ) {
      cjk++;
    }
  }
  return Math.ceil((total - cjk) / 3.5 + cjk * 1.1);
}

/** Tronca un testo a un numero massimo stimato di token, preferibilmente a fine frase. */
export function truncateToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, truncated: false };
  if (maxTokens <= 0) return { text: '', truncated: true };
  // Ricerca binaria sulla lunghezza in caratteri.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid)) <= maxTokens - 1) lo = mid;
    else hi = mid - 1;
  }
  let cut = text.slice(0, lo);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  if (lastStop > cut.length * 0.6) cut = cut.slice(0, lastStop + 1);
  return { text: cut.trimEnd() + ' […]', truncated: true };
}
