import { randomUUID } from 'node:crypto';
import type { ErrorCode } from '@persona/shared';
import { ZodError, type ZodType } from 'zod';

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Errore applicativo con codice stabile (tradotto nel frontend) e stato HTTP. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string, id?: string) =>
  new AppError('not_found', `${what} non trovato${id ? `: ${id}` : ''}`, 404);

/** Valida un input con zod e converte gli errori in AppError('validation'). */
export function validate<T extends ZodType>(schema: T, input: unknown): T['_output'] {
  try {
    return schema.parse(input ?? {});
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError(
        'validation',
        err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
        400,
        err.issues,
      );
    }
    throw err;
  }
}

/** Nome leggibile (in inglese, per i prompt) di un codice lingua. */
export function languageName(code: string | null | undefined, displayLocale = 'en'): string {
  if (!code) return '';
  try {
    const dn = new Intl.DisplayNames([displayLocale], { type: 'language' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

export function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function preview(text: string, max = 140): string {
  const t = compactWhitespace(text);
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
