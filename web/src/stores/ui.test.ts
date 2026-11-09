import { describe, expect, it } from 'vitest';
import i18n, { setUiLanguage } from '../i18n';
import { useUi } from './ui';

describe('ui preferences', () => {
  it('persists theme locally and toggles the dark class', () => {
    useUi.getState().setTheme('light');
    expect(localStorage.getItem('persona.theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    useUi.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the interface language', async () => {
    useUi.getState().setLanguage('en');
    await new Promise((r) => setTimeout(r, 0));
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('persona.uiLanguage')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('loads additional languages on demand', async () => {
    await setUiLanguage('de');
    expect(i18n.language).toBe('de');
    expect(i18n.t('nav.memory')).toBe('Gedächtnis');
    await setUiLanguage('pt');
    expect(i18n.t('chat.send')).toBe('Enviar');
    await setUiLanguage('xx');
    expect(i18n.language).toBe('pt');
    await setUiLanguage('it');
  });
});
