/**
 * Lingue dei contenuti McKee (stazioni, catalogo, verifiche, infografiche).
 *
 * Le stringhe inglesi sono le chiavi: `mt('it', 'Dimensions')` cerca la stringa nel
 * dizionario italiano e ricade sull'inglese, così un testo non tradotto resta leggibile.
 * Le chiavi "LISTA|Inglese" traducono una stringa solo dentro quella lista del catalogo
 * (stessa parola inglese, senso diverso: "Fantasy" genere vs. effetto del passato).
 *
 * I dati (catalogo e stazioni) non vengono mai modificati: `mckeeData(lang)` ne restituisce
 * una copia tradotta (memorizzata per lingua). Id, percorsi e valori salvati restano
 * identici in ogni lingua, quindi cambiare lingua non tocca i dati del personaggio.
 */
import * as CATALOG from './catalog.js';
import { PARTS, SECTIONS, STORY_FIELDS, type PartDef, type SectionDef, type FieldDef } from './sections.js';

export type Vars = Record<string, string | number | null | undefined>;
type Dict = Record<string, string>;

/** Lingue con un dizionario McKee completo; le altre lingue dell'interfaccia ricadono sull'inglese. */
export const MCKEE_LANGS = ['en', 'it'] as const;
const DICTS: Record<string, Dict> = { en: {} };

export function registerMckeeLocale(id: string, dict: Dict): void {
  DICTS[id] = { ...(DICTS[id] ?? {}), ...dict };
}

export function hasMckeeLocale(lang: string): boolean {
  return baseLang(lang) === 'en' || Object.keys(DICTS[baseLang(lang)] ?? {}).length > 0;
}

export function baseLang(lang: string | null | undefined): string {
  return String(lang || 'en').toLowerCase().split(/[-_]/)[0];
}

export function formatVars(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

export function mt(lang: string | null | undefined, s: string, vars?: Vars): string {
  if (s == null) return '';
  const d = DICTS[baseLang(lang)];
  const hit = d && Object.prototype.hasOwnProperty.call(d, s) ? d[s] : null;
  return formatVars(typeof hit === 'string' && hit ? hit : String(s), vars);
}

/** Singolare/plurale; {n} viene sostituito. */
export function mtn(lang: string | null | undefined, n: number, one: string, other: string, vars: Vars = {}): string {
  return mt(lang, n === 1 ? one : other, { n, ...vars });
}

/* ------------------------------------------------------------------ */
/* Copie tradotte del catalogo e delle stazioni                        */
/* ------------------------------------------------------------------ */

const TEXT_KEYS = new Set([
  'label', 'desc', 'short', 'left', 'right', 'madMen', 'twist', 'coreValue', 'coreEvent', 'coreEmotion', 'quality',
  'title', 'subtitle', 'principle', 'hint', 'placeholder', 'help',
]);
const TEXT_ARRAYS = new Set(['questions']);
// Restano in inglese: valori salvati (coreCast), chiavi (group), funzioni e identificatori.
const SKIP_KEYS = new Set(['coreCast', 'group', 'showIf', 'id', 'path', 'type', 'component', 'key']);

type Catalog = typeof CATALOG;

export interface McKeeData {
  lang: string;
  K: Catalog;
  PARTS: PartDef[];
  SECTIONS: SectionDef[];
  SECTION_BY_ID: Record<string, SectionDef>;
  STORY_FIELDS: FieldDef[];
  t(s: string, vars?: Vars): string;
  tn(n: number, one: string, other: string, vars?: Vars): string;
}

const CACHE = new Map<string, McKeeData>();

function translateWith(dict: Dict | null, en: string, ctx: string): string {
  if (!dict) return en;
  const ctxKey = `${ctx}|${en}`;
  if (Object.prototype.hasOwnProperty.call(dict, ctxKey) && dict[ctxKey]) return dict[ctxKey];
  if (Object.prototype.hasOwnProperty.call(dict, en) && dict[en]) return dict[en];
  return en;
}

function localizeTree(node: unknown, ctx: string, dict: Dict | null, memo: Map<object, unknown>): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (memo.has(node)) return memo.get(node);
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    memo.set(node, out);
    for (const item of node) out.push(localizeTree(item, ctx, dict, memo));
    return out;
  }
  const out: Record<string, unknown> = {};
  memo.set(node, out);
  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k)) out[k] = v;
    else if (typeof v === 'string' && TEXT_KEYS.has(k)) out[k] = v.trim() ? translateWith(dict, v, ctx) : v;
    else if (Array.isArray(v) && TEXT_ARRAYS.has(k)) out[k] = v.map((s) => (typeof s === 'string' ? translateWith(dict, s, ctx) : s));
    else if (v && typeof v === 'object') out[k] = localizeTree(v, ctx, dict, memo);
    else out[k] = v;
  }
  return out;
}

function build(lang: string): McKeeData {
  const dict = lang === 'en' ? null : (DICTS[lang] ?? null);
  const memo = new Map<object, unknown>();
  const K: Record<string, unknown> = {};
  // Il catalogo prima delle stazioni: le opzioni condivise prendono il contesto della loro lista.
  for (const [name, value] of Object.entries(CATALOG)) {
    if (name === 'BOOK') K[name] = value;
    else if (name === 'CHAPTERS') {
      K[name] = Object.fromEntries(Object.entries(value as Record<string, string>).map(([n, s]) => [n, translateWith(dict, s, '')]));
    } else if (name === 'DIMENSION_SUGGESTIONS') {
      K[name] = (value as [string, string][]).map(([a, b]) => [translateWith(dict, a, ''), translateWith(dict, b, '')]);
    } else K[name] = localizeTree(value, name, dict, memo);
  }
  const parts = localizeTree(PARTS, 'PARTS', dict, memo) as PartDef[];
  const sections = localizeTree(SECTIONS, 'SECTIONS', dict, memo) as SectionDef[];
  const storyFields = localizeTree(STORY_FIELDS, 'STORY_FIELDS', dict, memo) as FieldDef[];
  return {
    lang,
    K: K as unknown as Catalog,
    PARTS: parts,
    SECTIONS: sections,
    SECTION_BY_ID: Object.fromEntries(sections.map((s) => [s.id, s])),
    STORY_FIELDS: storyFields,
    t: (s, vars) => mt(lang, s, vars),
    tn: (n, one, other, vars) => mtn(lang, n, one, other, vars),
  };
}

/** Catalogo e stazioni nella lingua richiesta (inglese se non c'è un dizionario). */
export function mckeeData(lang: string | null | undefined): McKeeData {
  const id = hasMckeeLocale(baseLang(lang)) ? baseLang(lang) : 'en';
  let d = CACHE.get(id);
  if (!d) {
    d = build(id);
    CACHE.set(id, d);
  }
  return d;
}

/** Svuota la cache (dopo aver registrato un dizionario). */
export function resetMckeeCache(): void {
  CACHE.clear();
}

/** Tutte le stringhe inglesi dei dati (per i test di completezza delle traduzioni). */
export function dataStrings(): string[] {
  const out = new Set<string>();
  const memo = new Set<object>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || memo.has(node)) return;
    memo.add(node);
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      if (typeof v === 'string' && TEXT_KEYS.has(k) && v.trim()) out.add(v);
      else if (Array.isArray(v) && TEXT_ARRAYS.has(k)) v.forEach((s) => typeof s === 'string' && out.add(s));
      else if (v && typeof v === 'object') walk(v);
    }
  };
  for (const s of Object.values(CATALOG.CHAPTERS)) out.add(s);
  for (const pair of CATALOG.DIMENSION_SUGGESTIONS) pair.forEach((s) => out.add(s));
  for (const [name, value] of Object.entries(CATALOG)) if (!['BOOK', 'CHAPTERS', 'DIMENSION_SUGGESTIONS'].includes(name)) walk(value);
  walk(PARTS);
  walk(SECTIONS);
  walk(STORY_FIELDS);
  for (const g of CATALOG.PRIMARY_GENRES) for (const r of g.coreCast) out.add(r);
  return [...out];
}
