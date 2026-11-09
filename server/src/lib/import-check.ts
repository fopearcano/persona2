/**
 * Controlli comuni ai file di PERSONA (personaggio, scenario, progetto) prima della validazione
 * dettagliata: distinguono «file di un altro tipo» e «versione più recente» da un file corrotto,
 * con dettagli strutturati (`details.reason`) che l'interfaccia può tradurre.
 */
import { AppError } from './util.js';

export const PERSONA_FORMATS = ['persona.character', 'persona.scenario', 'persona.project'] as const;

export function assertPersonaFile(payload: unknown, expected: (typeof PERSONA_FORMATS)[number], supportedVersion: number): void {
  const p = payload && typeof payload === 'object' ? (payload as { format?: unknown; version?: unknown }) : null;
  const found = typeof p?.format === 'string' ? p.format : null;
  if (found !== expected) {
    const known = (PERSONA_FORMATS as readonly string[]).includes(found ?? '');
    throw new AppError(
      'invalid_import',
      known ? `Il file contiene «${found}», non «${expected}»` : 'Il file non è un\'esportazione di PERSONA',
      400,
      { reason: known ? 'wrong_format' : 'not_persona', expected, found },
    );
  }
  if (typeof p?.version === 'number' && p.version > supportedVersion) {
    throw new AppError(
      'invalid_import',
      `Formato ${expected} v${p.version} creato da una versione più recente di PERSONA (supportata: v${supportedVersion})`,
      400,
      { reason: 'newer_version', expected, version: p.version, supported: supportedVersion },
    );
  }
}

/** Intestazione Content-Disposition con nome ASCII di ripiego e nome UTF-8 (RFC 6266/5987). */
export function attachmentHeader(prefix: string, name: string, fallback: string): string {
  const unicode = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  const ascii =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || fallback;
  const full = `${prefix}-${unicode || fallback}.json`;
  return `attachment; filename="${prefix}-${ascii}.json"; filename*=UTF-8''${encodeURIComponent(full)}`;
}
