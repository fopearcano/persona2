import { UI_LANGUAGES } from '@persona/shared/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import it from './locales/it.json';

/**
 * Localizzazione dell'interfaccia. Italiano predefinito (riferimento delle chiavi) e inglese
 * inclusi nel bundle; francese, spagnolo, tedesco e portoghese caricati su richiesta.
 * Per aggiungere una lingua: creare locales/<codice>.json con le stesse chiavi di it.json,
 * aggiungerla a `loaders` e a UI_LANGUAGES (shared/src/constants.ts).
 */
export const resources = { it: { translation: it }, en: { translation: en } } as const;

export const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  fr: () => import('./locales/fr.json'),
  es: () => import('./locales/es.json'),
  de: () => import('./locales/de.json'),
  pt: () => import('./locales/pt.json'),
};

const STORAGE_KEY = 'persona.uiLanguage';

export function isUiLanguage(lng: string | null | undefined): lng is string {
  return !!lng && (UI_LANGUAGES as readonly string[]).includes(lng);
}

/** Carica (se necessario) e attiva una lingua dell'interfaccia. */
export async function setUiLanguage(lng: string): Promise<void> {
  if (!isUiLanguage(lng)) return;
  if (!i18n.hasResourceBundle(lng, 'translation') && loaders[lng]) {
    const mod = await loaders[lng]();
    i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
  }
  await i18n.changeLanguage(lng);
}

function storedLanguage(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isUiLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: 'it',
  fallbackLng: 'it',
  supportedLngs: [...UI_LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignora */
  }
});

/** Lingua salvata localmente, applicata prima del primo rendering. */
export const ready: Promise<void> = setUiLanguage(storedLanguage() ?? 'it');

export default i18n;
