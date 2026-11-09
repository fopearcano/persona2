import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, accentTokens, contrast, normalizeAppearance } from './appearance';

const SURFACES = {
  light: ['#f6f6f4', '#ffffff', '#f0f0ed'],
  dark: ['#111216', '#17191e', '#1e2127'],
} as const;

// Colori «difficili»: giallo e bianco puri nel tema chiaro, nero e blu scuro nel tema scuro, grigio medio.
const CUSTOM = ['#ffff00', '#ffffff', '#000000', '#000080', '#777777', '#ff00ff', '#00ffff', '#7c3aed'];

describe('accent colors', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`stay readable (WCAG AA) on every ${theme} surface, for presets and any custom color`, () => {
      const bases = [...Object.values(ACCENT_PRESETS).map((p) => p[theme]), ...CUSTOM];
      for (const base of bases) {
        const t = accentTokens(base, theme);
        for (const surface of [...SURFACES[theme], t.soft]) {
          expect(contrast(t.accent, surface), `${base} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
        // Testo dei pulsanti principali sull'accento.
        expect(contrast(t.fg, t.accent), `${base} button text`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('leaves already readable presets unchanged', () => {
    expect(accentTokens(ACCENT_PRESETS.blue.light, 'light').accent).toBe('#2f5bd3');
    expect(accentTokens(ACCENT_PRESETS.default.dark, 'dark').accent).toBe('#4ade80');
  });

  it('normalizes unknown or missing values to the defaults', () => {
    expect(normalizeAppearance({ fontUi: 'comic' as never, accent: 'pink' as never, textSize: undefined })).toEqual({
      fontUi: 'system',
      fontText: 'system',
      textSize: 'normal',
      accent: 'default',
      accentCustom: null,
    });
  });
});
