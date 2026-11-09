/**
 * Stile dell'interfaccia: caratteri, dimensione del testo e colore d'accento.
 * Si applica con variabili CSS su <html> (caratteri, dimensione) e con un foglio di stile
 * generato per i token d'accento dei due temi, così il cambio di tema non richiede ricalcoli.
 */
import type { AccentChoice, AppearancePreferences, FontChoice, TextSize } from '@persona/shared/client';

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  fontUi: 'system',
  fontText: 'system',
  textSize: 'normal',
  accent: 'default',
  accentCustom: null,
};

export const FONT_STACKS: Record<FontChoice, string> = {
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, Cambria, 'Times New Roman', 'Noto Serif', serif",
  // Courier Prime è incluso nell'app (nessun download): per gli alfabeti che non copre si usa Courier.
  typewriter: "'Courier Prime', 'Courier New', Courier, 'Nimbus Mono PS', monospace",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace",
};

/** Dimensione del carattere radice: tutta l'interfaccia (in rem) scala di conseguenza. */
export const TEXT_SIZE_ROOT: Record<TextSize, string> = {
  small: '93.75%',
  normal: '100%',
  large: '112.5%',
  xlarge: '125%',
};

/** Colori base [tema chiaro, tema scuro]; leggibilità garantita da `accentTokens`. */
export const ACCENT_PRESETS: Record<Exclude<AccentChoice, 'custom'>, { light: string; dark: string }> = {
  default: { light: '#c2410c', dark: '#4ade80' },
  green: { light: '#15803d', dark: '#4ade80' },
  orange: { light: '#c2410c', dark: '#fb923c' },
  blue: { light: '#2f5bd3', dark: '#8fb3ff' },
  violet: { light: '#6d28d9', dark: '#c4b5fd' },
  rose: { light: '#be123c', dark: '#fb7185' },
  teal: { light: '#0f766e', dark: '#2dd4bf' },
  amber: { light: '#a16207', dark: '#fbbf24' },
  graphite: { light: '#3f3f46', dark: '#d4d4d8' },
};

/* ------------------------------------------------------------------ */
/* Colore                                                              */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Miscela: t = 0 → a, t = 1 → b. */
function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

function luminance(hex: string): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Rapporto di contrasto WCAG 2.x. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Superfici dei due temi (devono corrispondere a index.css). */
const SURFACES = {
  light: { bg: '#f6f6f4', panel: '#ffffff', panel2: '#f0f0ed' },
  dark: { bg: '#111216', panel: '#17191e', panel2: '#1e2127' },
} as const;

export interface AccentTokens {
  accent: string;
  soft: string;
  fg: string;
}

/**
 * Token d'accento per un tema: il colore viene scurito (tema chiaro) o schiarito (tema scuro)
 * finché il testo in accento non raggiunge il contrasto AA (4,5:1) su tutte le superfici,
 * compreso lo sfondo tenue usato per gli elementi attivi.
 */
export function accentTokens(base: string, theme: 'light' | 'dark'): AccentTokens {
  const s = SURFACES[theme];
  const toward = theme === 'light' ? '#000000' : '#ffffff';
  const softOf = (c: string) => (theme === 'light' ? mix(s.panel, c, 0.08) : mix(s.bg, c, 0.16));
  let accent = base.toLowerCase();
  for (let i = 0; i < 40; i++) {
    const soft = softOf(accent);
    const worst = Math.min(contrast(accent, s.bg), contrast(accent, s.panel), contrast(accent, s.panel2), contrast(accent, soft));
    if (worst >= 4.5) break;
    accent = mix(accent, toward, 0.06);
  }
  const fg = contrast('#ffffff', accent) >= contrast('#0b0d12', accent) ? '#ffffff' : '#0b0d12';
  return { accent, soft: softOf(accent), fg };
}

export function accentBase(a: AppearancePreferences): { light: string; dark: string } {
  if (a.accent === 'custom') {
    const c = a.accentCustom && /^#[0-9a-f]{6}$/i.test(a.accentCustom) ? a.accentCustom : ACCENT_PRESETS.default.dark;
    return { light: c, dark: c };
  }
  return ACCENT_PRESETS[a.accent] ?? ACCENT_PRESETS.default;
}

/* ------------------------------------------------------------------ */
/* Applicazione                                                        */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'persona-accent';

export function normalizeAppearance(a: Partial<AppearancePreferences> | null | undefined): AppearancePreferences {
  const merged = { ...DEFAULT_APPEARANCE, ...(a ?? {}) };
  return {
    fontUi: merged.fontUi in FONT_STACKS ? merged.fontUi : 'system',
    fontText: merged.fontText in FONT_STACKS ? merged.fontText : 'system',
    textSize: merged.textSize in TEXT_SIZE_ROOT ? merged.textSize : 'normal',
    accent: merged.accent === 'custom' || merged.accent in ACCENT_PRESETS ? merged.accent : 'default',
    accentCustom: merged.accentCustom ?? null,
  };
}

export function applyAppearance(input: Partial<AppearancePreferences>) {
  const a = normalizeAppearance(input);
  const root = document.documentElement;
  root.style.setProperty('--app-font-ui', FONT_STACKS[a.fontUi]);
  root.style.setProperty('--app-font-text', FONT_STACKS[a.fontText]);
  root.style.fontSize = a.textSize === 'normal' ? '' : TEXT_SIZE_ROOT[a.textSize];
  root.dataset.fontUi = a.fontUi;
  root.dataset.fontText = a.fontText;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (a.accent === 'default') {
    // I colori predefiniti sono già in index.css.
    style?.remove();
    return;
  }
  const base = accentBase(a);
  const light = accentTokens(base.light, 'light');
  const dark = accentTokens(base.dark, 'dark');
  const rule = (sel: string, t: AccentTokens) => `${sel}{--accent:${t.accent};--accent-soft:${t.soft};--accent-fg:${t.fg}}`;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // html:root / html.dark hanno precedenza su :root / .dark di index.css.
  style.textContent = `${rule('html:root', light)}\n${rule('html.dark', dark)}`;
}
