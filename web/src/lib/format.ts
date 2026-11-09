import i18n from '../i18n';

/** Data e ora localizzate secondo la lingua dell'interfaccia. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(i18n.language, opts).format(n);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${formatNumber(n)} B`;
  if (n < 1024 * 1024) return `${formatNumber(n / 1024, { maximumFractionDigits: 1 })} KB`;
  return `${formatNumber(n / 1024 / 1024, { maximumFractionDigits: 1 })} MB`;
}

/** Nome della lingua nella lingua dell'interfaccia (es. "ru" → "russo"). */
export function languageLabel(code: string | null | undefined, uiLang = i18n.language): string {
  if (!code) return '';
  try {
    const name = new Intl.DisplayNames([uiLang], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(uiLang) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** Nome della lingua nella lingua stessa (es. "ru" → "Русский"). */
export function nativeLanguageLabel(code: string): string {
  return languageLabel(code, code);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
