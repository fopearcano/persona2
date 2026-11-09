/**
 * Costruzione McKee del personaggio (da CharBuild): forma dei dati, valori
 * predefiniti, normalizzazione e accesso per percorso.
 *
 * L'ordine segue l'argomentazione di McKee (CHARACTER, 2021): concetto → ruolo →
 * esteriore (caratterizzazione) → sé → interiore (vero carattere) → dimensioni →
 * complessità → arco → simbolo → genere → azione → performance → relazioni.
 *
 * Il nome, l'id e i Big Five appartengono all'identità di PERSONA: la costruzione
 * non li duplica (i Big Five vengono mostrati nella stazione 04 ma salvati
 * nell'identità, vedi `bigFiveToBuild`/`bigFiveFromBuild`).
 */

export const BUILD_SCHEMA_VERSION = 1;

type Num = number | null;
type NumMap = Record<string, number>;

export interface Dimension {
  id: string;
  positive?: string;
  negative?: string;
  type?: string;
  level?: string;
  defining?: boolean;
  positiveExample?: string;
  negativeExample?: string;
  consistent?: boolean;
  variable?: boolean;
  unresolvable?: boolean;
}

export interface Persona {
  id: string;
  with?: string;
  axis?: string;
  persona?: string;
}

export interface TurningPoint {
  id: string;
  label?: string;
  charge?: number;
}

export interface Scene {
  id: string;
  title?: string;
  objective?: string;
  action?: string;
  expectation?: string;
  counteraction?: string;
  source?: string;
  surprise?: string;
  value?: string;
  from?: number;
  to?: number;
  reaction?: string;
  next?: string;
}

export interface Relationship {
  id: string;
  targetId?: string;
  kind?: string;
  effect?: string;
  draws?: string;
  bringsOut?: string;
  dimensionId?: string;
  notes?: string;
}

/** Le sedici stazioni del costruttore, in un unico documento JSON. */
export interface CharacterBuild {
  schema: number;
  /** Includere il profilo McKee nel contesto delle conversazioni del personaggio. */
  useInContext: boolean;
  concept: {
    nickname: string;
    roleLabel: string;
    logline: string;
    inspiration: string[];
    tellingDetail: string;
    magicIf: string;
    approach: string;
    inCharacter: string;
    research: string[];
    researchNotes: string;
  };
  cast: {
    circle: string;
    function: string;
    specialRoles: string[];
    protagonistType: string;
    essentials: string[];
    essentialsNotes: string;
    centerOfGood: string;
    foilOf: string;
    foilFunctions: string[];
    narrator: { person: string; reliability: string; cause: string };
    mapAngle: Num;
  };
  outer: {
    /** Tratti espliciti (testo) più `workIdentity` (0–10). */
    explicit: Record<string, string | number | null>;
    expressed: Record<string, boolean>;
    spectra: NumMap;
    implicit: {
      bigFive: NumMap;
      intelligence: NumMap;
      habitsOfThought: string;
      flexibility: Num;
      likes: string;
      dislikes: string;
      fears: string;
      outlook: Num;
      whoAreYou: string;
      achieve: string;
      mustDo: string;
      mustNever: string;
      humanNature: string;
      mood: string;
      temperament: string;
      authority: Num;
      mirror: string;
    };
    functions: string[];
    setting: {
      period: string;
      location: string;
      levels: string[];
      physical: string;
      social: string;
      personal: string;
      restraints: string;
      relation: string;
      extendedSelf: string;
      change: string[];
      values: string;
    };
    expression: Record<string, string>;
  };
  selves: { social: string; personal: string; core: string; hidden: string; variation: string; personae: Persona[] };
  inner: {
    motivations: NumMap;
    moreKind: string;
    outsideIn: string;
    backstory: { patterns: string; adolescence: string; identity: string };
    incitingIncident: string;
    incitingCharge: string;
    superObjective: string;
    objectOfDesire: string;
    desireKind: string;
    dilemma: { kind: string; optionA: string; optionB: string; choice: string };
    pressure: { risk: Num; freedom: Num; notes: string };
    values: NumMap;
    emotions: NumMap;
    emotionStyle: string;
    feelings: NumMap;
    reactions: string;
    decisionPath: string;
  };
  dimensions: Dimension[];
  complexity: {
    antagonism: NumMap;
    antagonismNotes: Record<string, string>;
    capacity: Num;
    subconsciousDesire: string;
    innerConflicts: string[];
    depthTraits: string[];
    subtext: { text: string; sub: string; unsayable: string };
    secrets: string;
  };
  arc: {
    need: string;
    needTypes: string[];
    potential: NumMap;
    incitingTuned: string;
    seemsAtStart: string;
    isAtClimax: string;
    theory: string;
    type: string;
    dimensionId: string;
    from: string;
    to: string;
    plot: string;
    lifeView: string;
    reaction: string;
    pastEffect: string;
    turningPoints: TurningPoint[];
    climax: string;
    epiphany: string;
    completion: string;
  };
  symbolic: {
    spectrum: Num;
    level: string;
    archetypes: string[];
    allegory: string;
    typeAdjective: string;
    stockJob: string;
    veil: string;
    stereotypeChecked: boolean;
    mode: string;
    subtractions: string[];
  };
  genre: { coreCastRole: string; subplotGenre: string; notes: string };
  action: {
    selfStory: { past: string; present: string; future: string };
    mo: { theme: string; description: string; twist: string };
    probability: string;
    scenes: Scene[];
  };
  performance: { functions: string[]; discovery: string; recognition: string; curiosity: Num; concern: Num; notes: string };
  relationships: Relationship[];
  notes: string;
}

/** Impianto narrativo McKee di un progetto (la storia condivisa dal cast). Il titolo è il nome del progetto. */
export interface StoryDesign {
  schema: number;
  logline: string;
  media: string[];
  format: string;
  causality: string;
  theme: string;
  coreValue: { positive: string; negative: string };
  genre: { primary: string[]; presentational: string[]; combination: string };
  world: { period: string; duration: string; location: string; levels: string[]; notes: string };
  notes: string;
}

/** Un personaggio così come lo vedono analisi, infografiche e coach: identità minima + costruzione. */
export type McKeeCharacter = CharacterBuild & { id: string; name: string };
/** Una storia come la vedono analisi ed export: titolo (nome del progetto) + impianto. */
export type McKeeStory = StoryDesign & { id?: string; title: string };

export function uid(prefix = 'id'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export function newBuild(): CharacterBuild {
  return {
    schema: BUILD_SCHEMA_VERSION,
    useInContext: true,
    concept: {
      nickname: '', roleLabel: '', logline: '', inspiration: [], tellingDetail: '', magicIf: '',
      approach: '', inCharacter: '', research: [], researchNotes: '',
    },
    cast: {
      circle: '', function: '', specialRoles: [], protagonistType: '', essentials: [], essentialsNotes: '',
      centerOfGood: '', foilOf: '', foilFunctions: [],
      narrator: { person: '', reliability: '', cause: '' },
      mapAngle: null,
    },
    outer: {
      explicit: {
        nameMeaning: '', age: '', appearance: '', wardrobe: '', gender: '', eros: '', voice: '', face: '',
        gestures: '', profession: '', recreation: '', home: '', transport: '', knowledge: '', ignorance: '',
        beliefs: '', conversation: '', manners: '', workIdentity: null,
      },
      expressed: {},
      spectra: {},
      implicit: {
        bigFive: {}, intelligence: {}, habitsOfThought: '', flexibility: null,
        likes: '', dislikes: '', fears: '', outlook: null, whoAreYou: '', achieve: '', mustDo: '', mustNever: '',
        humanNature: '', mood: '', temperament: '', authority: null, mirror: '',
      },
      functions: [],
      setting: {
        period: '', location: '', levels: [], physical: '', social: '', personal: '', restraints: '',
        relation: '', extendedSelf: '', change: [], values: '',
      },
      expression: {},
    },
    selves: { social: '', personal: '', core: '', hidden: '', variation: '', personae: [] },
    inner: {
      motivations: {}, moreKind: '', outsideIn: '',
      backstory: { patterns: '', adolescence: '', identity: '' },
      incitingIncident: '', incitingCharge: '', superObjective: '', objectOfDesire: '', desireKind: '',
      dilemma: { kind: '', optionA: '', optionB: '', choice: '' },
      pressure: { risk: null, freedom: null, notes: '' },
      values: {}, emotions: {}, emotionStyle: '', feelings: {}, reactions: '', decisionPath: '',
    },
    dimensions: [],
    complexity: {
      antagonism: {}, antagonismNotes: {}, capacity: null,
      subconsciousDesire: '', innerConflicts: [], depthTraits: [],
      subtext: { text: '', sub: '', unsayable: '' },
      secrets: '',
    },
    arc: {
      need: '', needTypes: [], potential: {}, incitingTuned: '',
      seemsAtStart: '', isAtClimax: '',
      theory: '', type: '', dimensionId: '', from: '', to: '', plot: '', lifeView: '', reaction: '', pastEffect: '',
      turningPoints: [],
      climax: '', epiphany: '', completion: '',
    },
    symbolic: {
      spectrum: null, level: '', archetypes: [], allegory: '', typeAdjective: '', stockJob: '', veil: '',
      stereotypeChecked: false, mode: '', subtractions: [],
    },
    genre: { coreCastRole: '', subplotGenre: '', notes: '' },
    action: {
      selfStory: { past: '', present: '', future: '' },
      mo: { theme: '', description: '', twist: '' },
      probability: '',
      scenes: [],
    },
    performance: { functions: [], discovery: '', recognition: '', curiosity: null, concern: null, notes: '' },
    relationships: [],
    notes: '',
  };
}

export function newStoryDesign(): StoryDesign {
  return {
    schema: BUILD_SCHEMA_VERSION,
    logline: '',
    media: [],
    format: '',
    causality: '',
    theme: '',
    coreValue: { positive: '', negative: '' },
    genre: { primary: [], presentational: [], combination: '' },
    world: { period: '', duration: '', location: '', levels: [], notes: '' },
    notes: '',
  };
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

/** Unisce `patch` in una copia di `base`; array e scalari di `patch` prevalgono. Ignora le chiavi pericolose. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = isPlainObject(base) ? { ...(base as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (isUnsafeKey(k)) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const MAX_STRING = 20000;
const MAX_ITEMS = 200;

/**
 * Copia "pulita" di un valore JSON: solo tipi JSON, niente chiavi pericolose,
 * stringhe e liste limitate, profondità limitata. Usata per dati che arrivano
 * dall'esterno (API, file importati, proposte del coach).
 */
export function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
      return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'boolean':
      return value;
    case 'object': {
      if (Array.isArray(value)) {
        return value.slice(0, MAX_ITEMS).map((v) => sanitizeJson(v, depth + 1)).filter((v) => v !== undefined);
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (isUnsafeKey(k) || k.length > 80) continue;
        const clean = sanitizeJson(v, depth + 1);
        if (clean !== undefined) out[k] = clean;
      }
      return out;
    }
    default:
      return undefined;
  }
}

/** Riempie con i valori predefiniti le chiavi mancanti (dati salvati da versioni precedenti o importati). */
export function normalizeBuild(raw: unknown): CharacterBuild {
  const clean = sanitizeJson(raw);
  const base = newBuild();
  if (!isPlainObject(clean)) return base;
  // Solo le chiavi note al primo livello: niente dati estranei nell'identità.
  const known: Record<string, unknown> = {};
  for (const k of Object.keys(base)) if (k in clean) known[k] = clean[k];
  const merged = deepMerge(base, known);
  merged.schema = BUILD_SCHEMA_VERSION;
  merged.useInContext = merged.useInContext !== false;
  // Le liste devono restare liste di oggetti con un id.
  merged.dimensions = listOf(merged.dimensions, 'dim');
  merged.selves.personae = listOf(merged.selves.personae, 'per');
  merged.arc.turningPoints = listOf(merged.arc.turningPoints, 'tp');
  merged.action.scenes = listOf(merged.action.scenes, 'sc');
  merged.relationships = listOf(merged.relationships, 'rel');
  return merged;
}

function listOf<T extends { id: string }>(v: unknown, prefix: string): T[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isPlainObject)
    .map((item) => ({ ...item, id: typeof item.id === 'string' && /^[\w-]{1,60}$/.test(item.id) ? item.id : uid(prefix) }) as unknown as T);
}

export function normalizeStoryDesign(raw: unknown): StoryDesign {
  const clean = sanitizeJson(raw);
  const base = newStoryDesign();
  if (!isPlainObject(clean)) return base;
  const known: Record<string, unknown> = {};
  for (const k of Object.keys(base)) if (k in clean) known[k] = clean[k];
  const merged = deepMerge(base, known);
  merged.schema = BUILD_SCHEMA_VERSION;
  return merged;
}

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const key of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(key) ? cur[Number(key)] : (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Modifica `obj`; crea gli oggetti intermedi mancanti. Rifiuta le chiavi del prototipo. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = String(path).split('.');
  let cur = obj as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (isUnsafeKey(key)) throw new Error(`Unsafe path segment: ${key}`);
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (isUnsafeKey(last)) throw new Error(`Unsafe path segment: ${last}`);
  cur[last] = value;
  return obj;
}

export function isFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.length > 0;
  if (isPlainObject(v)) return Object.values(v).some(isFilled);
  return false;
}

/** La costruzione contiene qualcosa oltre ai valori predefiniti? */
export function isBuildEmpty(b: CharacterBuild): boolean {
  const { schema: _s, useInContext: _u, ...rest } = b;
  return !isFilled(rest);
}

export function displayName(c: { name?: string } | null | undefined, fallback = '?'): string {
  return (c && c.name && c.name.trim()) || fallback;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Big Five: un'unica fonte (l'identità di PERSONA)                    */
/* ------------------------------------------------------------------ */

export interface BigFiveScores {
  openness: number | null;
  conscientiousness: number | null;
  extraversion: number | null;
  agreeableness: number | null;
  neuroticism: number | null;
}

/** I Big Five dell'identità visti dalla stazione 04 (McKee usa "razionalità" = 100 − nevroticismo). */
export function bigFiveToBuild(bf: BigFiveScores | null | undefined): NumMap {
  const out: NumMap = {};
  if (!bf) return out;
  if (bf.openness != null) out.openness = bf.openness;
  if (bf.conscientiousness != null) out.conscientiousness = bf.conscientiousness;
  if (bf.extraversion != null) out.extraversion = bf.extraversion;
  if (bf.agreeableness != null) out.agreeableness = bf.agreeableness;
  if (bf.neuroticism != null) out.rationality = 100 - bf.neuroticism;
  return out;
}

/** I valori della stazione 04 riportati nell'identità (null se nessuno è impostato). */
export function bigFiveFromBuild(m: NumMap | null | undefined): BigFiveScores | null {
  const v = (k: string) => {
    const n = m?.[k];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  };
  const r = v('rationality');
  const out: BigFiveScores = {
    openness: v('openness'),
    conscientiousness: v('conscientiousness'),
    extraversion: v('extraversion'),
    agreeableness: v('agreeableness'),
    neuroticism: r == null ? null : 100 - r,
  };
  return Object.values(out).some((x) => x != null) ? out : null;
}
