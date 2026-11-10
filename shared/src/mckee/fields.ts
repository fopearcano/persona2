/**
 * Indice piatto di ogni percorso modificabile della costruzione, ricavato dalle stazioni.
 * Serve a validare e applicare gli aggiornamenti proposti dal coach (o importati), così
 * nulla può scrivere fuori dallo schema.
 */
import { mckeeData } from './i18n.js';
import { sectionFields } from './sections.js';
import { getPath, isPlainObject, setPath, uid, type CharacterBuild } from './model.js';

type ItemSpec = 'text' | 'boolean' | 'ref-character' | 'ref-dimension' | { enum: string[] } | { min: number; max: number };

export interface ListShape {
  label: string;
  section: string;
  item: Record<string, ItemSpec>;
  required: string[];
}

export type FieldIndexEntry =
  | { kind: 'text' | 'boolean' | 'ref-dimension' | 'ref-character'; label: string; section: string }
  | { kind: 'number'; min: number; max: number; label: string; section: string }
  | { kind: 'enum' | 'multi'; options: string[]; label: string; section: string }
  | ({ kind: 'list' } & ListShape);

function listShapes(lang: string): Record<string, ListShape> {
  const { K, t } = mckeeData(lang);
  return {
    dimensions: {
      label: t('Dimensions'),
      section: 'dimensions',
      item: {
        positive: 'text', negative: 'text', type: { enum: K.DIMENSION_TYPES.map((x) => x.id) },
        level: { enum: K.SELF_LEVELS.map((s) => s.id) }, defining: 'boolean',
        positiveExample: 'text', negativeExample: 'text', consistent: 'boolean', variable: 'boolean', unresolvable: 'boolean',
      },
      required: ['positive', 'negative'],
    },
    'selves.personae': {
      label: t('Personae'), section: 'selves',
      item: { with: 'text', axis: { enum: ['power', 'intimacy'] }, persona: 'text' },
      required: ['with', 'persona'],
    },
    'arc.turningPoints': {
      label: t('Turning points'), section: 'arc',
      item: { label: 'text', charge: { min: -5, max: 5 } },
      required: ['label', 'charge'],
    },
    'action.scenes': {
      label: t('Scenes'), section: 'action',
      item: {
        title: 'text', objective: 'text', action: 'text', expectation: 'text', counteraction: 'text',
        source: { enum: K.COUNTERACTION_SOURCES.map((s) => s.id) }, surprise: 'text', value: 'text',
        from: { min: -5, max: 5 }, to: { min: -5, max: 5 }, reaction: 'text', next: 'text',
      },
      required: ['title'],
    },
    relationships: {
      label: t('Relationships'), section: 'relationships',
      item: {
        targetId: 'ref-character', kind: { enum: K.RELATIONSHIP_KINDS.map((k) => k.id) },
        effect: { enum: K.RELATIONSHIP_EFFECTS.map((k) => k.id) }, draws: 'text', bringsOut: 'text', dimensionId: 'ref-dimension', notes: 'text',
      },
      required: ['targetId'],
    },
  };
}

const INDEX = new Map<string, Record<string, FieldIndexEntry>>();

export function fieldIndex(lang = 'en'): Record<string, FieldIndexEntry> {
  const M = mckeeData(lang);
  const cached = INDEX.get(M.lang);
  if (cached) return cached;
  const { K, t } = M;
  const idx: Record<string, FieldIndexEntry> = {};
  const add = (path: string, def: FieldIndexEntry) => {
    if (!idx[path]) idx[path] = def;
  };
  for (const s of M.SECTIONS) {
    for (const f of sectionFields(s)) {
      const label = f.label || K.EXPLICIT_TRAITS.find((x) => x.id === f.key)?.label || f.path;
      switch (f.type) {
        case 'spectra':
        case 'sliders':
          for (const it of f.items ?? []) {
            add(`${f.path}.${it.id}`, { kind: 'number', min: f.min ?? 0, max: f.max ?? 10, label: `${label === f.path ? '' : `${label}: `}${it.label}`, section: s.id });
          }
          break;
        case 'slider':
          add(f.path, { kind: 'number', min: f.min ?? 0, max: f.max ?? 10, label, section: s.id });
          break;
        case 'chips':
        case 'checklist':
          add(f.path, { kind: 'multi', options: (f.options ?? []).map((o) => o.id), label, section: s.id });
          break;
        case 'radio':
        case 'select':
          add(f.path, { kind: 'enum', options: (f.options ?? []).map((o) => o.id), label, section: s.id });
          break;
        case 'toggle':
          add(f.path, { kind: 'boolean', label, section: s.id });
          break;
        case 'trait':
          add(f.path, { kind: 'text', label, section: s.id });
          add(`outer.expressed.${f.key}`, { kind: 'boolean', label: t('{label} is dramatized', { label }), section: s.id });
          break;
        case 'custom':
          break;
        default:
          add(f.path, { kind: 'text', label, section: s.id });
      }
    }
  }
  for (const f of K.ANTAGONISM_FORCES) {
    add(`complexity.antagonism.${f.id}`, { kind: 'number', min: 0, max: 10, label: t('Antagonism: {force}', { force: f.label }), section: 'complexity' });
    add(`complexity.antagonismNotes.${f.id}`, { kind: 'text', label: t('Antagonism note: {force}', { force: f.label }), section: 'complexity' });
  }
  add('complexity.capacity', { kind: 'number', min: 0, max: 10, label: t('Protagonist capacity'), section: 'complexity' });
  add('arc.dimensionId', { kind: 'ref-dimension', label: t('Arc dimension'), section: 'arc' });
  add('genre.coreCastRole', { kind: 'text', label: t('Core-cast position'), section: 'genre' });
  add('action.mo.theme', { kind: 'enum', options: K.MO_THEMES.map((m) => m.id), label: t('MO theme'), section: 'action' });
  for (const [path, shape] of Object.entries(listShapes(M.lang))) add(path, { kind: 'list', ...shape });
  INDEX.set(M.lang, idx);
  return idx;
}

export function describeFieldIndex(section?: string | null, lang = 'en'): string {
  const lines: string[] = [];
  for (const [path, d] of Object.entries(fieldIndex(lang))) {
    if (section && d.section !== section) continue;
    let type: string;
    if (d.kind === 'number') type = `number ${d.min}..${d.max}`;
    else if (d.kind === 'enum') type = `one of [${d.options.join(', ')}]`;
    else if (d.kind === 'multi') type = `array of [${d.options.join(', ')}]`;
    else if (d.kind === 'list') {
      type = `list; append items {${Object.entries(d.item)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : 'enum' in v ? v.enum.join('|') : `${v.min}..${v.max}`}`)
        .join(', ')}}`;
    } else type = d.kind;
    lines.push(`${path} — ${d.label} — ${type}`);
  }
  return lines.join('\n');
}

/**
 * Campi dell'identità di PERSONA che l'assistente di costruzione (modalità guidata) può
 * proporre accanto alla costruzione McKee: percorsi `identity.<campo>`, sempre testo.
 * Non stanno nella costruzione: il browser li applica alla bozza dell'identità e
 * vengono salvati con la costruzione in un'unica revisione.
 */
export const IDENTITY_FIELDS: { key: string; label: string; max: number }[] = [
  { key: 'name', label: 'Full name', max: 200 },
  { key: 'age', label: 'Age', max: 100 },
  { key: 'origin', label: 'Place of origin', max: 500 },
  { key: 'culturalBackground', label: 'Cultural background', max: 4000 },
  { key: 'occupation', label: 'Occupation', max: 500 },
  { key: 'education', label: 'Education', max: 4000 },
  { key: 'biography', label: 'Biography', max: 12000 },
  { key: 'appearance', label: 'Physical appearance', max: 4000 },
  { key: 'temperament', label: 'Temperament', max: 4000 },
  { key: 'interpersonalStyle', label: 'Interpersonal style', max: 4000 },
  { key: 'conflictResponse', label: 'Response to conflict', max: 4000 },
  { key: 'stressResponse', label: 'Reaction to stress', max: 4000 },
  { key: 'register', label: 'Linguistic register', max: 4000 },
  { key: 'vocabulary', label: 'Vocabulary', max: 4000 },
  { key: 'humor', label: 'Humor', max: 4000 },
];
export const IDENTITY_KEYS = IDENTITY_FIELDS.map((f) => f.key);
export const isIdentityPath = (path: string) => path.startsWith('identity.');

export function describeIdentityFields(): string {
  return IDENTITY_FIELDS.map((f) => `identity.${f.key} — ${f.label} — text`).join('\n');
}

export interface UpdateContext {
  /** Accetta anche i campi `identity.*` (assistente di costruzione). */
  allowIdentity?: boolean;
  build?: CharacterBuild | null;
  /** Id dei personaggi a cui una relazione può puntare (esclusa la persona stessa). */
  castIds?: string[];
  /** Id di dimensioni create nella stessa proposta. */
  pendingDimensionIds?: string[];
}

export interface BuildUpdate {
  path: string;
  op: 'set' | 'append';
  value: unknown;
  label: string;
  rationale?: string;
}

function coerceScalar(kind: string, def: { min?: number; max?: number; options?: string[] }, value: unknown, ctx: UpdateContext): unknown {
  switch (kind) {
    case 'text':
      if (value == null) return '';
      return (typeof value === 'string' ? value : String(value)).slice(0, 4000);
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error('expected a number');
      return Math.max(def.min ?? 0, Math.min(def.max ?? 10, Math.round(n * 10) / 10));
    }
    case 'boolean':
      return value === true || value === 'true';
    case 'enum':
      if (value === '' || value == null) return '';
      if (typeof value !== 'string' || !def.options?.includes(value)) throw new Error(`expected one of ${def.options?.join(', ')}`);
      return value;
    case 'multi': {
      const arr = Array.isArray(value) ? value : [value];
      const bad = arr.filter((v) => typeof v !== 'string' || !def.options?.includes(v));
      if (bad.length) throw new Error(`unknown option(s) ${bad.join(', ')}; allowed: ${def.options?.join(', ')}`);
      return [...new Set(arr as string[])];
    }
    case 'ref-dimension':
      if (value === '' || value == null) return '';
      if (
        typeof value !== 'string' ||
        (!(ctx.build?.dimensions ?? []).some((d) => d.id === value) && !(ctx.pendingDimensionIds ?? []).includes(value))
      ) {
        throw new Error('unknown dimension id');
      }
      return value;
    case 'ref-character':
      if (typeof value !== 'string' || !(ctx.castIds ?? []).includes(value)) throw new Error('unknown character id');
      return value;
    default:
      throw new Error(`unsupported kind ${kind}`);
  }
}

function coerceItem(shape: ListShape, raw: unknown, ctx: UpdateContext): Record<string, unknown> {
  if (!isPlainObject(raw)) throw new Error('list item must be an object');
  const item: Record<string, unknown> = { id: typeof raw.id === 'string' && /^[\w-]{1,60}$/.test(raw.id) ? raw.id : uid('it') };
  for (const [k, spec] of Object.entries(shape.item)) {
    if (raw[k] === undefined) continue;
    if (typeof spec === 'string') item[k] = coerceScalar(spec, {}, raw[k], ctx);
    else if ('enum' in spec) item[k] = coerceScalar('enum', { options: spec.enum }, raw[k], ctx);
    else item[k] = coerceScalar('number', spec, raw[k], ctx);
  }
  for (const req of shape.required) {
    if (item[req] === undefined || item[req] === '') throw new Error(`list item needs "${req}"`);
  }
  return item;
}

/** Valida un aggiornamento {path, value, op}. */
export function validateUpdate(
  u: { path?: unknown; op?: unknown; value?: unknown } | null | undefined,
  ctx: UpdateContext = {},
  lang = 'en',
): { ok: true; update: BuildUpdate } | { ok: false; error: string } {
  const idx = fieldIndex(lang);
  if (!u || typeof u.path !== 'string') return { ok: false, error: 'missing path' };
  const op = u.op === 'append' ? 'append' : u.op === undefined || u.op === 'set' ? 'set' : String(u.op);
  if (isIdentityPath(u.path)) {
    const field = IDENTITY_FIELDS.find((f) => `identity.${f.key}` === u.path);
    if (!ctx.allowIdentity || !field) return { ok: false, error: `unknown path "${u.path}"` };
    if (op !== 'set') return { ok: false, error: `${u.path}: identity fields only accept op "set"` };
    const text = u.value == null ? '' : (typeof u.value === 'string' ? u.value : String(u.value)).trim().slice(0, field.max);
    if (field.key === 'name' && !text) return { ok: false, error: `${u.path}: a name cannot be empty` };
    return { ok: true, update: { path: u.path, op: 'set', value: text, label: field.label } };
  }
  const def = idx[u.path];
  if (!def) {
    const last = u.path.split('.').pop();
    const near = Object.keys(idx).filter((p) => p.split('.').pop() === last).slice(0, 3);
    return { ok: false, error: `unknown path "${u.path}"${near.length ? ` (did you mean ${near.join(', ')}?)` : ''}` };
  }
  try {
    if (def.kind === 'list') {
      if (op === 'append') return { ok: true, update: { path: u.path, op, value: coerceItem(def, u.value, ctx), label: def.label } };
      if (op === 'set') {
        if (!Array.isArray(u.value)) throw new Error('set on a list needs an array');
        return { ok: true, update: { path: u.path, op, value: u.value.map((v) => coerceItem(def, v, ctx)), label: def.label } };
      }
      throw new Error(`unsupported op "${op}"`);
    }
    if (op === 'append' && def.kind === 'multi') {
      return { ok: true, update: { path: u.path, op, value: coerceScalar('multi', def, u.value, ctx), label: def.label } };
    }
    if (op !== 'set') throw new Error(`op "${op}" only applies to lists and multi-selects`);
    return { ok: true, update: { path: u.path, op: 'set', value: coerceScalar(def.kind, def as { min?: number; max?: number; options?: string[] }, u.value, ctx), label: def.label } };
  } catch (err) {
    return { ok: false, error: `${u.path}: ${(err as Error).message}` };
  }
}

/** Applica aggiornamenti già validati a una copia della costruzione. */
export function applyUpdates(build: CharacterBuild, updates: Pick<BuildUpdate, 'path' | 'op' | 'value'>[]): CharacterBuild {
  const next = structuredClone(build);
  const idx = fieldIndex('en');
  for (const u of updates) {
    // I campi dell'identità non stanno nella costruzione (vedi IDENTITY_FIELDS).
    if (isIdentityPath(u.path)) continue;
    const cur = getPath(next, u.path);
    if (u.op === 'append') {
      const arr = Array.isArray(cur) ? cur : [];
      const add = Array.isArray(u.value) ? u.value : [u.value];
      setPath(next, u.path, idx[u.path]?.kind === 'multi' ? [...new Set([...arr, ...add])] : [...arr, ...add]);
    } else {
      setPath(next, u.path, structuredClone(u.value));
    }
    // Una sola dimensione definitoria.
    if (u.path === 'dimensions') {
      const dims = next.dimensions;
      const definers = dims.filter((d) => d.defining);
      if (definers.length > 1) {
        const v = u.value as { defining?: boolean } | unknown[];
        const keep = Array.isArray(v) ? definers[0] : v.defining ? dims[dims.length - 1] : definers[0];
        for (const d of dims) d.defining = d === keep;
      }
    }
  }
  return next;
}

/** Contesto di validazione per una costruzione e il suo cast. */
export function updateContext(build: CharacterBuild, selfId: string, castIds: string[], updates: { path?: unknown; value?: unknown }[] = []): UpdateContext {
  return {
    build,
    castIds: castIds.filter((x) => x !== selfId),
    pendingDimensionIds: updates
      .filter((u) => u?.path === 'dimensions')
      .flatMap((u) => ([] as unknown[]).concat(u.value ?? []))
      .map((v) => (isPlainObject(v) && typeof v.id === 'string' ? v.id : null))
      .filter((x): x is string => !!x),
  };
}
