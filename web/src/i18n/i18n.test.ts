import { UI_LANGUAGES } from '@persona/shared/client';
import { describe, expect, it } from 'vitest';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it_ from './locales/it.json';
import pt from './locales/pt.json';
import { loaders, resources as bundled } from './index';

const resources = { it: { translation: it_ }, en: { translation: en }, fr: { translation: fr }, es: { translation: es }, de: { translation: de }, pt: { translation: pt } };

type Tree = Record<string, unknown>;

function flat(o: unknown, p = ''): [string, string][] {
  if (typeof o === 'string') return [[p, o]];
  return Object.entries(o as Tree).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k));
}
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const reference = new Map(flat(resources.it.translation));
const others = Object.keys(resources).filter((l) => l !== 'it') as (keyof typeof resources)[];

describe('translations', () => {
  it('every interface language is bundled or lazily loadable', () => {
    expect([...Object.keys(bundled), ...Object.keys(loaders)].sort()).toEqual([...UI_LANGUAGES].sort());
  });

  it.each(others)('%s exposes exactly the keys of the Italian reference', (lang) => {
    expect(flat(resources[lang].translation).map(([k]) => k).sort()).toEqual([...reference.keys()].sort());
  });

  it.each(others)('%s keeps the same interpolation placeholders', (lang) => {
    for (const [k, v] of flat(resources[lang].translation)) expect(placeholders(v), `${lang}:${k}`).toEqual(placeholders(reference.get(k) ?? ''));
  });

  it('has no empty strings', () => {
    for (const lang of Object.keys(resources) as (keyof typeof resources)[]) {
      expect(flat(resources[lang].translation).filter(([, v]) => !v.trim())).toEqual([]);
    }
  });
});
