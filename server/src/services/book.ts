/**
 * Ricerca locale nella copia dell'autore di CHARACTER di McKee (un file .epub).
 *
 * Il libro NON è incluso nell'app: l'autore carica la propria copia (Impostazioni →
 * Libro di McKee, salvata in `<dati>/books/`) oppure indica `PERSONA_BOOK_PATH`.
 * Viene letto a runtime, diviso in brevi passaggi etichettati per capitolo e sezione
 * e ordinato con BM25. Lo usano il coach (passaggi pertinenti nel contesto) e la
 * scheda "Libro" del costruttore. (Porting da CharBuild.)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import type { BookPassage, BookSearchResult, BookStatus } from '@persona/shared';
import { bookSearchSchema } from '@persona/shared';
import type { AppContext } from '../context.js';
import { AppError, validate } from '../lib/util.js';
import { ZipReader } from '../lib/zip.js';
import { expandItalianQuery } from './book-terms.js';

const STOP = new Set(
  'a an and are as at be but by for from has have he her hers him his i if in into is it its me my no not of on or our she so than that the their them then there these they this to us was we were what when which who whom why will with would you your yours can could did do does done had how just more most much must only other over own same should some such too very about after again all also am any because been before being below between both down during each few further here itself let nor off once out shall since through under until up upon while yet'.split(
    /\s+/,
  ),
);

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<sup[\s\S]*?<\/sup>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Piccolo stemmer a suffissi: "dimensions"/"dimensional" incontrano "dimension". */
function stem(t: string): string {
  for (const suf of ['ational', 'ization', 'iveness', 'fulness', 'ousness', 'ments', 'ment', 'ings', 'ing', 'ies', 'edly', 'ed', 'es', 'al', 's']) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) return suf === 'ies' ? `${t.slice(0, -3)}y` : t.slice(0, -suf.length);
  }
  return t;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z][a-z'-]+/g) ?? [])
    .map((t) => t.replace(/'s$/, '').replace(/^-+|-+$/g, ''))
    .flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

const SKIP_TITLES = /^(notes|index|acknowledg|about the author|copyright|contents|also by)/i;

interface Passage {
  id: number;
  chapter: string;
  part: string;
  section: string;
  text: string;
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s:—(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export function parseEpub(file: Buffer): { title: string; passages: Passage[] } {
  const zip = new ZipReader(file);
  const container = zip.readText('META-INF/container.xml');
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error('Not a valid EPUB: missing rootfile');
  const opf = zip.readText(opfPath);
  if (!opf) throw new Error('Not a valid EPUB: missing package document');
  const base = posix.dirname(opfPath);
  const manifest: Record<string, string> = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (id && href) manifest[id] = posix.normalize(base === '.' ? href : `${base}/${href}`);
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => manifest[m[1]]).filter(Boolean);
  const title = stripTags(opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1] ?? 'Book');

  const blocks: Omit<Passage, 'id'>[] = [];
  let chapterNum = '';
  let chapter = 'Front matter';
  let part = '';
  let section = '';
  let skipping = false;
  for (const href of spine) {
    let html: string | null = null;
    try {
      html = zip.readText(decodeURIComponent(href)) ?? zip.readText(href);
    } catch {
      html = zip.readText(href);
    }
    if (!html) continue;
    if (/epub:type="[^"]*rearnote/.test(html)) continue; // note finali
    for (const m of html.matchAll(/<(h[1-6]|p|li|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const tag = m[1].toLowerCase();
      const cls = m[2].match(/class="([^"]*)"/)?.[1] ?? '';
      const text = stripTags(m[3]);
      if (!text) continue;
      if (tag[0] === 'h') {
        const level = Number(tag[1]);
        if (/chapter-number/.test(cls)) {
          chapterNum = text;
          continue;
        }
        if (/part-number/.test(cls)) {
          part = `Part ${text.replace(/^part\s*/i, '')}`;
          continue;
        }
        if (/part-title/.test(cls)) {
          part = `${part ? `${part}: ` : ''}${titleCase(text)}`;
          continue;
        }
        if (level === 1 && !/^sect/.test(cls)) {
          chapter = `${chapterNum && /chapter-title/.test(cls) ? `Ch. ${chapterNum} — ` : ''}${titleCase(text)}`;
          section = '';
          skipping = SKIP_TITLES.test(text);
          if (!/chapter-title/.test(cls)) chapterNum = '';
          continue;
        }
        // h1.sect / h2 aprono una sezione; h3+ la precisano.
        if (level <= 2) section = titleCase(text);
        else section = `${section.split(' › ')[0]} › ${titleCase(text)}`;
        if (/^glossary$/i.test(text)) {
          chapter = 'Glossary';
          section = '';
        }
        continue;
      }
      if (skipping) continue;
      blocks.push({ chapter, part, section, text });
    }
  }
  return { title, passages: chunk(blocks) };
}

function chunk(blocks: Omit<Passage, 'id'>[], target = 210): Passage[] {
  const passages: Omit<Passage, 'id'>[] = [];
  let cur: (Omit<Passage, 'id'> & { words: number }) | null = null;
  const flush = () => {
    if (cur && cur.text.trim()) passages.push(cur);
    cur = null;
  };
  for (const b of blocks) {
    if (cur && (cur.chapter !== b.chapter || cur.section !== b.section)) flush();
    if (!cur) cur = { chapter: b.chapter, part: b.part, section: b.section, text: '', words: 0 };
    const w = b.text.split(/\s+/).length;
    if (cur.words && cur.words + w > target * 1.5) {
      flush();
      cur = { chapter: b.chapter, part: b.part, section: b.section, text: '', words: 0 };
    }
    cur.text += (cur.text ? '\n' : '') + b.text;
    cur.words += w;
    if (cur.words >= target) flush();
  }
  flush();
  return passages.map((p, i) => ({ id: i, chapter: p.chapter, part: p.part, section: p.section, text: p.text }));
}

export class BookIndex {
  private readonly docs: { tf: Map<string, number>; len: number }[];
  private readonly avgLen: number;
  private readonly df = new Map<string, number>();

  constructor(
    readonly passages: Passage[],
    readonly title: string,
  ) {
    this.docs = passages.map((p) => {
      const toks = tokenize(`${p.section} ${p.section} ${p.text}`);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { tf, len: toks.length };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  search(query: string, limit = 5): (Passage & { score: number })[] {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const N = this.docs.length;
    const k1 = 1.4;
    const b = 0.75;
    const scored: [number, number][] = [];
    this.docs.forEach((d, i) => {
      let score = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen)));
      }
      if (score > 0) scored.push([score, i]);
    });
    scored.sort((x, y) => y[0] - x[0]);
    return scored.slice(0, limit).map(([score, i]) => ({ ...this.passages[i], score: Math.round(score * 100) / 100 }));
  }
}

/* ------------------------------------------------------------------ */
/* File del libro e indice in memoria                                  */
/* ------------------------------------------------------------------ */

const booksDir = (ctx: AppContext) => join(ctx.config.dataDir, 'books');

function findBookFile(ctx: AppContext): { file: string; fromEnv: boolean } | null {
  const env = process.env.PERSONA_BOOK_PATH;
  if (env) return existsSync(env) ? { file: env, fromEnv: true } : null;
  const dir = booksDir(ctx);
  if (!existsSync(dir)) return null;
  const epub = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.epub'))
    .sort()[0];
  return epub ? { file: join(dir, epub), fromEnv: false } : null;
}

type Cached = { key: string; index: BookIndex | null; error: string | null; file: string; fromEnv: boolean };
let cached: Cached | null = null;

function loadIndex(ctx: AppContext): Cached | null {
  const found = findBookFile(ctx);
  if (!found) {
    cached = null;
    return null;
  }
  const key = `${found.file}|${statSync(found.file).mtimeMs}`;
  if (cached?.key === key) return cached;
  try {
    const { title, passages } = parseEpub(readFileSync(found.file));
    if (!passages.length) throw new Error('no readable text');
    cached = { key, index: new BookIndex(passages, title), error: null, file: found.file, fromEnv: found.fromEnv };
  } catch (err) {
    cached = { key, index: null, error: (err as Error).message, file: found.file, fromEnv: found.fromEnv };
  }
  return cached;
}

export function bookStatus(ctx: AppContext): BookStatus {
  const c = loadIndex(ctx);
  if (!c) return { available: false, file: null, title: null, passages: 0, fromEnv: !!process.env.PERSONA_BOOK_PATH, error: null };
  return {
    available: !!c.index,
    file: basename(c.file),
    title: c.index?.title ?? null,
    passages: c.index?.passages.length ?? 0,
    fromEnv: c.fromEnv,
    error: c.error,
  };
}

/** `lang`: lingua di chi cerca; le ricerche in italiano includono il lessico inglese di McKee. */
export function searchBook(ctx: AppContext, query: string, limit = 5, lang = 'en', maxChars = 1400): BookSearchResult {
  const c = loadIndex(ctx);
  if (!c?.index) return { available: false, query, results: [] };
  const q = lang.toLowerCase().startsWith('it') ? expandItalianQuery(query) : query;
  const results: BookPassage[] = c.index.search(q, limit).map((r) => ({
    chapter: r.chapter,
    section: r.section,
    score: r.score,
    text: r.text.length > maxChars ? `${r.text.slice(0, maxChars).replace(/\s+\S*$/, '')}…` : r.text,
  }));
  return { available: true, query, results };
}

export function searchBookRoute(ctx: AppContext, query: unknown): BookSearchResult {
  const { q, limit, lang } = validate(bookSearchSchema, query);
  return searchBook(ctx, q, limit, lang);
}

/** Salva la copia dell'autore (sostituisce quella precedente). Il file deve essere un EPUB leggibile. */
export function uploadBook(ctx: AppContext, data: Buffer, fileName: string): BookStatus {
  if (process.env.PERSONA_BOOK_PATH) throw new AppError('invalid_book', 'Il libro è impostato da PERSONA_BOOK_PATH', 409);
  try {
    const parsed = parseEpub(data);
    if (!parsed.passages.length) throw new Error('no readable text');
  } catch (err) {
    throw new AppError('invalid_book', `EPUB non valido: ${(err as Error).message}`, 400);
  }
  const dir = booksDir(ctx);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.toLowerCase().endsWith('.epub')) rmSync(join(dir, f), { force: true });
  const safe = (basename(fileName).replace(/[^\w.\- ]+/g, '_').replace(/\.epub$/i, '').slice(0, 120) || 'book') + '.epub';
  writeFileSync(join(dir, safe), data);
  cached = null;
  return bookStatus(ctx);
}

export function removeBook(ctx: AppContext): BookStatus {
  if (process.env.PERSONA_BOOK_PATH) throw new AppError('invalid_book', 'Il libro è impostato da PERSONA_BOOK_PATH', 409);
  const dir = booksDir(ctx);
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.toLowerCase().endsWith('.epub')) rmSync(join(dir, f), { force: true });
  cached = null;
  return bookStatus(ctx);
}
