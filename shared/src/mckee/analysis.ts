/**
 * Motore di analisi: completezza, punteggi derivati per le infografiche e
 * "verifiche McKee" (diagnosi pratiche tratte dai principi del libro).
 * Funzioni pure, usate dal browser e dal coach. Le funzioni che producono testo
 * ricevono la lingua (`lang`); id e valori restano in inglese.
 */
import * as K from './catalog.js';
import { mckeeData, mt, type McKeeData } from './i18n.js';
import { SECTIONS, sectionFields, type SectionField } from './sections.js';
import { displayName, getPath, isFilled, isPlainObject, type McKeeCharacter, type McKeeStory, type StoryDesign } from './model.js';

const EXPLICIT_KEYS = K.EXPLICIT_TRAITS.map((t) => t.id);
const MAJOR = new Set(['protagonist', 'first']);

/**
 * Stazioni che un ruolo dovrebbe completare. McKee: i ruoli del secondo cerchio portano
 * una dimensione o un solo tratto; quelli del terzo restano quasi senza dimensioni. (Cap. 6, 17)
 */
const EXPECTED_BY_CIRCLE: Record<string, string[]> = {
  protagonist: SECTIONS.map((s) => s.id),
  first: SECTIONS.map((s) => s.id).filter((id) => id !== 'performance'),
  second: ['spark', 'role', 'explicit', 'implicit', 'desire', 'relationships'],
  third: ['spark', 'role', 'explicit'],
};

export function expectedSections(c: Pick<McKeeCharacter, 'cast'> | null | undefined): string[] {
  return EXPECTED_BY_CIRCLE[c?.cast?.circle ?? ''] ?? EXPECTED_BY_CIRCLE.protagonist;
}

export function fieldVisible(field: Pick<SectionField, 'showIf'> & { group?: SectionField['group'] }, c: McKeeCharacter, story?: StoryDesign | null): boolean {
  if (field.group?.showIf && !field.group.showIf(c, story)) return false;
  if (field.showIf && !field.showIf(c, story)) return false;
  return true;
}

function fieldFilled(field: SectionField, c: McKeeCharacter): boolean | null {
  const v = getPath(c, field.path);
  switch (field.type) {
    case 'spectra':
    case 'sliders':
      return isPlainObject(v) && (field.items ?? []).some((it) => Number.isFinite(v[it.id]));
    case 'toggle':
      return v === true;
    case 'custom':
      switch (field.component) {
        case 'turningPoints':
          return Array.isArray(v) && v.length >= 2;
        case 'antagonism':
          return isPlainObject(v) && Object.values(v).some((x) => Number.isFinite(x));
        case 'genreInfo':
          return null; // informativo, non conta
        case 'coreCastPicker':
          return isFilled(c.genre?.coreCastRole);
        default:
          return isFilled(v);
      }
    default:
      return isFilled(v);
  }
}

export interface Progress {
  filled: number;
  total: number;
  ratio: number;
}

export function sectionProgress(c: McKeeCharacter, sectionId: string, story?: StoryDesign | null): Progress {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return { filled: 0, total: 0, ratio: 0 };
  const seen = new Set<string>();
  let filled = 0;
  let total = 0;
  for (const f of sectionFields(section)) {
    if (!fieldVisible(f, c, story)) continue;
    const key = f.type === 'spectra' || f.type === 'sliders' ? `${f.path}:${(f.items ?? []).map((i) => i.id).join(',')}` : f.path;
    if (seen.has(key)) continue;
    seen.add(key);
    const res = fieldFilled(f, c);
    if (res === null) continue;
    total += 1;
    if (res) filled += 1;
  }
  return { filled, total, ratio: total ? filled / total : 0 };
}

/**
 * Campi ancora vuoti di una tappa (visibili per questo personaggio), con etichetta: servono
 * all'assistente di costruzione per decidere che cosa chiedere.
 */
export function missingFields(c: McKeeCharacter, sectionId: string, story?: StoryDesign | null, M: McKeeData = mckeeData('en')): { path: string; label: string }[] {
  const section = M.SECTION_BY_ID[sectionId];
  if (!section) return [];
  const seen = new Set<string>();
  const out: { path: string; label: string }[] = [];
  for (const f of sectionFields(section)) {
    if (!fieldVisible(f, c, story) || f.component === 'genreInfo') continue;
    const key = f.type === 'spectra' || f.type === 'sliders' ? `${f.path}:${(f.items ?? []).map((i) => i.id).join(',')}` : f.path;
    if (seen.has(key)) continue;
    seen.add(key);
    if (fieldFilled(f, c)) continue;
    const label = f.label || M.K.EXPLICIT_TRAITS.find((x) => x.id === f.key)?.label || (f.items ?? []).map((i) => i.label).join(' / ') || f.path;
    out.push({ path: f.path, label });
  }
  return out;
}

/** La tappa su cui proseguire: la prima attesa per il ruolo poco compilata (null se tutto è compilato). */
export function nextStation(c: McKeeCharacter, story?: StoryDesign | null): string | null {
  const progress = overallProgress(c, story);
  const expected = expectedSections(c);
  return expected.find((id) => progress.bySection[id].ratio < 0.5) ?? expected.find((id) => progress.bySection[id].ratio < 1) ?? null;
}

export function overallProgress(c: McKeeCharacter, story?: StoryDesign | null): Progress & { bySection: Record<string, Progress & { expected: boolean }> } {
  const expected = expectedSections(c);
  let filled = 0;
  let total = 0;
  const bySection: Record<string, Progress & { expected: boolean }> = {};
  for (const s of SECTIONS) {
    const p = sectionProgress(c, s.id, story);
    bySection[s.id] = { ...p, expected: expected.includes(s.id) };
    if (expected.includes(s.id)) {
      filled += p.filled;
      total += p.total;
    }
  }
  return { filled, total, ratio: total ? filled / total : 0, bySection };
}

/* ------------------------------------------------------------------ */
/* Punteggi derivati                                                   */
/* ------------------------------------------------------------------ */

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function traitDensity(c: McKeeCharacter) {
  const ex = c.outer?.explicit ?? {};
  const known = EXPLICIT_KEYS.filter((k) => isFilled(ex[k]));
  const expressed = known.filter((k) => c.outer?.expressed?.[k]);
  return {
    total: EXPLICIT_KEYS.length,
    known: known.length,
    expressed: expressed.length,
    // quota di ciò che l'autore sa che va in scena; l'ideale di McKee ≈ 0,3
    expressedRatio: known.length ? expressed.length / known.length : 0,
    knownKeys: known,
    expressedKeys: expressed,
  };
}

export function antagonismProfile(c: McKeeCharacter) {
  const a = c.complexity?.antagonism ?? {};
  const forces = K.ANTAGONISM_FORCES.map((f) => ({ ...f, value: fin(a[f.id]) ? a[f.id] : 0 }));
  const sumSq = forces.reduce((s, f) => s + f.value * f.value, 0);
  // Le forze si sommano: tante forze medie possono travolgere come una enorme.
  const power = Math.min(10, Math.sqrt(sumSq));
  const capacity = fin(c.complexity?.capacity) ? c.complexity.capacity : null;
  const levels = new Set(forces.filter((f) => f.value > 0).map((f) => f.level));
  return {
    forces,
    power: Math.round(power * 10) / 10,
    capacity,
    levelsEngaged: levels.size,
    underdog: capacity == null ? null : power > capacity,
    margin: capacity == null ? null : Math.round((power - capacity) * 10) / 10,
  };
}

export function choiceDepth(c: McKeeCharacter): number | null {
  const risk = c.inner?.pressure?.risk;
  const freedom = c.inner?.pressure?.freedom;
  if (!fin(risk) || !fin(freedom)) return null;
  // Principio 2: più rischio → scelta più profonda. Principio 3: più libera → ancora più profonda.
  return Math.round(((risk * (freedom + 5)) / 15) * 10) / 10;
}

export function definingDimension(c: McKeeCharacter) {
  return (c.dimensions ?? []).find((d) => d.defining) ?? null;
}

export function suspenseScore(c: McKeeCharacter): number | null {
  const cu = c.performance?.curiosity;
  const co = c.performance?.concern;
  if (!fin(cu) || !fin(co)) return null;
  return Math.round(Math.sqrt(cu * co) * 10) / 10; // servono entrambe
}

function tokens(s: unknown): Set<string> {
  return new Set(String(s || '').toLowerCase().match(/[a-zà-ɏ]{3,}/g) ?? []);
}

export function similarity(a: unknown, b: unknown): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/* ------------------------------------------------------------------ */
/* Verifiche McKee                                                     */
/* ------------------------------------------------------------------ */

export type CheckLevel = 'warn' | 'tip' | 'good';

export interface McKeeCheck {
  /** Stabile tra le lingue: `<stazione>:<titolo inglese>`. */
  id: string;
  level: CheckLevel;
  section: string;
  title: string;
  detail: string;
  ref: string;
}

type Detail = string | { key: string; vars: Record<string, string | number | null | undefined> };

function checker(lang: string) {
  return (level: CheckLevel, section: string, title: string, detail: Detail, ref: string): McKeeCheck => ({
    id: `${section}:${title}`,
    level,
    section,
    title: mt(lang, title),
    detail: typeof detail === 'string' ? mt(lang, detail) : mt(lang, detail.key, detail.vars),
    ref: ref.replace(/^Ch\./, mt(lang, 'Ch.')),
  });
}

const d = (key: string, vars: Record<string, string | number | null | undefined>) => ({ key, vars });

export function characterChecks(c: McKeeCharacter, story: McKeeStory | StoryDesign | null | undefined, cast: McKeeCharacter[] = [], lang = 'en'): McKeeCheck[] {
  const check = checker(lang);
  const M = mckeeData(lang);
  const out: McKeeCheck[] = [];
  const circle = c.cast?.circle;
  const major = MAJOR.has(circle) || !circle;
  const isProt = circle === 'protagonist';
  const dims = c.dimensions ?? [];

  if (!circle) out.push(check('tip', 'role', 'Place her in the cast', 'Choose an orbit: protagonist, first, second or third circle. Expectations for depth follow from it.', 'Ch. 6'));
  if (isFilled(c.concept?.inspiration) && !isFilled(c.concept?.tellingDetail)) {
    out.push(check('tip', 'spark', 'Find the telling detail', 'One unique facet that implies an entire humanity is what turns an inspiration into belief.', 'Ch. 4'));
  }

  if (isProt) {
    if (!isFilled(c.cast?.centerOfGood)) out.push(check('warn', 'role', 'Locate the Center of Good', 'The audience searches the story for a positive charge to attach its empathy to — usually in the protagonist.', 'Ch. 6'));
    const ess = (c.cast?.essentials ?? []).length;
    if (ess >= 7) out.push(check('good', 'role', 'Protagonist essentials covered', d('{n} of 8 essentials checked.', { n: ess }), 'Ch. 6'));
    else if (ess < 5) {
      out.push(check('tip', 'role', 'Protagonist essentials', d('{n}/8 checked. Willpower, capability, underdog status, empathy, intrigue, depth, capacity for change and insight make a lead worth the audience’s time.', { n: ess }), 'Ch. 6'));
    }
  }

  // Tratti espliciti e regola dei 3/10
  const td = traitDensity(c);
  if (major && td.known < 4) out.push(check('tip', 'explicit', 'Thin characterization', d('Only {n} explicit traits known. Credibility begins with characterization — follow her around 24/7.', { n: td.known }), 'Ch. 7'));
  if (td.known >= 5 && td.expressedRatio > 0.6) {
    out.push(check('tip', 'explicit', 'Leave seven-tenths unknown', d('You plan to dramatize {pct}% of what you know. McKee suggests expressing about three-tenths and letting the audience fill in the rest.', { pct: Math.round(td.expressedRatio * 100) }), 'Ch. 7'));
  }
  if (isProt && td.expressed === 1) out.push(check('warn', 'explicit', 'One lone trait', 'A single expressed trait (a foreign accent, say) shrinks a character to a bit part.', 'Ch. 7'));
  if (td.known >= 5 && td.expressedRatio >= 0.2 && td.expressedRatio <= 0.45) {
    out.push(check('good', 'explicit', 'Trait density near 3/10', d('{shown} of {known} known traits dramatized.', { shown: td.expressed, known: td.known }), 'Ch. 7'));
  }

  // Quattro sé
  if (major) {
    const filledSelves = K.SELF_LEVELS.filter((s) => isFilled((c.selves as unknown as Record<string, unknown>)?.[s.id])).length;
    if (filledSelves > 0 && filledSelves < 4) {
      out.push(check('tip', 'selves', 'Complete the four selves', d('{n}/4 levels defined. Major characters should be known socially, personally, privately and in the hidden self.', { n: filledSelves }), 'Ch. 5'));
    }
    if (filledSelves === 4) out.push(check('good', 'selves', 'Known at all four levels', 'Social, personal, core and hidden selves are defined.', 'Ch. 5'));
  }

  // Motivazione → desiderio
  const mot = c.inner?.motivations ?? {};
  const rated = K.MOTIVATIONS.filter((m) => Number(mot[m.id]) > 0);
  if (major && rated.length === 0) out.push(check('tip', 'desire', 'What pushes her?', 'Rate the inner motivations — unsated appetites that push from the past.', 'Ch. 8'));
  if (rated.filter((m) => Number(mot[m.id]) >= 8).length > 6) out.push(check('tip', 'desire', 'Everything at full volume', 'More than six drives at 8+ blurs her. Which hungers dominate?', 'Ch. 8'));
  if (isFilled(c.inner?.incitingIncident) && !isFilled(c.inner?.objectOfDesire)) {
    out.push(check('warn', 'desire', 'Inciting incident without a desire', 'Once life is thrown out of balance she must conceive an object of desire that would restore it.', 'Ch. 8'));
  }
  if (isProt && isFilled(c.inner?.objectOfDesire) && !isFilled(c.inner?.incitingIncident)) {
    out.push(check('tip', 'desire', 'What sets the desire in motion?', 'A motivation is a latency until an inciting incident focuses it on a desire.', 'Ch. 8'));
  }

  // Dilemma e pressione
  const dl = c.inner?.dilemma ?? { optionA: '', optionB: '' };
  if (isProt && !(isFilled(dl.optionA) && isFilled(dl.optionB))) {
    out.push(check('warn', 'choice', 'No true dilemma yet', 'Clear choices between positive and negative are trivial. Only a choice between near-equal goods or evils reveals true character.', 'Ch. 8'));
  }
  if (isFilled(dl.optionA) && isFilled(dl.optionB) && similarity(dl.optionA, dl.optionB) > 0.7) {
    out.push(check('tip', 'choice', 'Options look alike', 'The two horns of the dilemma read almost the same. Sharpen what each costs.', 'Ch. 8'));
  }
  const depth = choiceDepth(c);
  if (isProt && depth != null && depth < 5) {
    out.push(check('tip', 'choice', 'Raise the stakes of the crisis', d('Choice depth {n}/10. The greater the risk — and the freer the choice — the deeper and truer it is.', { n: depth }), 'Ch. 8'));
  }

  // Dimensioni
  if (isProt && dims.length < 3) {
    out.push(check('warn', 'dimensions', 'Protagonist needs dimensions', d('{n} dimension(s). The protagonist should carry the majority of the cast’s contradictions — often more than three.', { n: dims.length }), 'Ch. 9, 17'));
  }
  if (circle === 'first' && dims.length === 0) out.push(check('tip', 'dimensions', 'Give her a dimension', 'First-circle roles generally feature one or two dimensions.', 'Ch. 9'));
  if (['second', 'third'].includes(circle) && dims.length > 1) {
    out.push(check('tip', 'dimensions', 'Too dimensional for the orbit', 'Dimensions consume storytelling time. Limit second-circle roles to their distinctive traits, or promote her.', 'Ch. 6, 17'));
  }
  const definers = dims.filter((x) => x.defining);
  if (dims.length >= 2 && definers.length === 0) out.push(check('warn', 'dimensions', 'Choose a defining dimension', 'One contradiction should stand forward — the one without which she would vanish.', 'Ch. 9'));
  if (definers.length > 1) out.push(check('warn', 'dimensions', 'More than one defining dimension', 'Only one dimension defines her essential spirit; the others complete the portrait.', 'Ch. 9'));
  if (definers.length === 1 && dims.length >= 3) {
    out.push(check('good', 'dimensions', 'Defining dimension set', d('{pos} / {neg} anchors {n} dimensions.', { pos: definers[0].positive || '?', neg: definers[0].negative || '?', n: dims.length }), 'Ch. 9'));
  }
  if (dims.some((x) => !isFilled(x.positive) || !isFilled(x.negative))) {
    out.push(check('warn', 'dimensions', 'Half a dimension', 'A dimension needs both poles of the contradiction.', 'Ch. 9'));
  }
  if (dims.some((x) => isFilled(x.positive) && isFilled(x.negative) && !(isFilled(x.positiveExample) && isFilled(x.negativeExample)))) {
    out.push(check('tip', 'dimensions', 'Show both sides in action', 'A dimension must be consistent (a pattern, not a one-off kindness or a snit) and variable. Note a behaviour for each pole.', 'Ch. 9'));
  }

  // Antagonismo
  const ap = antagonismProfile(c);
  if (isProt && ap.underdog === false) {
    out.push(check('warn', 'complexity', 'Not an underdog', d('Capacity {capacity} vs. antagonism {power}. The forces of antagonism should virtually overwhelm her — she should have only a chance.', { capacity: ap.capacity, power: ap.power }), 'Ch. 6'));
  }
  if (isProt && ap.underdog === true) out.push(check('good', 'complexity', 'Underdog confirmed', d('Antagonism {power} outweighs capacity {capacity}.', { power: ap.power, capacity: ap.capacity }), 'Ch. 6'));
  if (major && ap.power > 0 && ap.levelsEngaged < 2) {
    out.push(check('tip', 'complexity', 'Conflict on one level only', 'The more various the antagonisms, the more diverse her choices — and the more complex her nature.', 'Ch. 10'));
  }
  const conscious = c.inner?.objectOfDesire;
  const sub = c.complexity?.subconsciousDesire;
  if (isProt && isFilled(conscious) && !isFilled(sub)) out.push(check('tip', 'complexity', 'Any counterdesire?', 'A complex protagonist’s subconscious often pursues an object that contradicts the conscious one.', 'Ch. 10'));
  if (isFilled(conscious) && isFilled(sub) && similarity(conscious, sub) > 0.5) {
    out.push(check('warn', 'complexity', 'Desires don’t contradict', 'If the subconscious wants what the conscious mind wants, who would notice? Make them collide.', 'Ch. 10'));
  }
  const dt = (c.complexity?.depthTraits ?? []).length;
  if (dt >= 6) out.push(check('good', 'complexity', 'Depth of character', d('{n}/10 depth traits — antihero territory.', { n: dt }), 'Ch. 10'));

  // Arco
  const arc = c.arc;
  if (isProt && !isFilled(arc?.need)) {
    out.push(check('warn', 'arc', 'Name her need', 'At the inciting incident major characters are incomplete. What void in her humanity will the story fill (or fail to)?', 'Ch. 11'));
  }
  if (['positive', 'negative', 'double'].includes(arc?.type)) {
    if (!arc.dimensionId) out.push(check('warn', 'arc', 'Arc without a dimension', 'Change, when it occurs, arcs along the character’s defining dimension.', 'Ch. 11'));
    else {
      const dim = dims.find((x) => x.id === arc.dimensionId);
      if (dim && !dim.defining) out.push(check('tip', 'arc', 'Arc on a secondary dimension', 'McKee places change on the defining dimension. Is this the one that defines her?', 'Ch. 11'));
    }
  }
  const tps = arc?.turningPoints ?? [];
  const charged = tps.filter((x) => Number(x.charge));
  if (charged.length >= 3) {
    const signs = new Set(charged.map((x) => Math.sign(Number(x.charge))));
    if (signs.size === 1) out.push(check('warn', 'arc', 'Repetition is the mortal enemy', 'Every turning point has the same charge. Arcs move in dynamic zigzags of positive and negative.', 'Ch. 11'));
    const last = Number(tps[tps.length - 1].charge) || 0;
    if (arc.type === 'positive' && last < 0) out.push(check('tip', 'arc', 'Positive arc ends negative', 'A positive arc ends on a positive charge.', 'Ch. 11'));
    if (arc.type === 'negative' && last > 0) out.push(check('tip', 'arc', 'Negative arc ends positive', 'A negative arc deepens toward tragedy.', 'Ch. 11'));
  }
  const storyGenres = (story?.genre?.primary ?? []).map((id) => M.K.PRIMARY_GENRES.find((g) => g.id === id)).filter((g) => !!g);
  const characterPlot = storyGenres.find((g) => g.family === 'character');
  if (isProt && characterPlot && arc?.type === 'revealed') {
    out.push(check('tip', 'arc', 'Genre expects change', d('{genre} arcs the protagonist’s {quality}. A revealed-only arc fights the genre.', { genre: characterPlot.label, quality: characterPlot.quality?.toLowerCase() }), 'Ch. 14'));
  }
  if (isProt && characterPlot?.arc && ['positive', 'negative'].includes(arc?.type) && characterPlot.arc !== arc.type) {
    out.push(
      check(
        'tip',
        'arc',
        'Arc direction vs. genre',
        characterPlot.arc === 'positive' ? d('{genre} implies a positive arc.', { genre: characterPlot.label }) : d('{genre} implies a negative arc.', { genre: characterPlot.label }),
        'Ch. 14',
      ),
    );
  }

  // Simbolo
  const sym = c.symbolic;
  if (sym && (sym.level === 'archetype' || (sym.archetypes ?? []).length) && !isFilled(sym.veil)) {
    out.push(check('warn', 'symbolic', 'Veil the archetype', 'If the audience thinks “she’s a symbol for…”, the role flattens. Invent a never-seen-before characterization.', 'Ch. 12'));
  }
  if (sym && ['type', 'stock'].includes(sym.level) && !sym.stereotypeChecked) {
    out.push(check('tip', 'symbolic', 'Stereotype check', 'Types and stocks risk cliché; stereotypes are worse — they distort the truth. Test against “All Xs are Y.”', 'Ch. 12'));
  }
  if (sym?.mode === 'radicalism') out.push(check('tip', 'symbolic', 'Radical territory', 'Most readers and audiences want Realism or Nonrealism — rarely Radicalism. Choose it knowingly.', 'Ch. 13'));

  // Genere
  if (storyGenres.length && !isFilled(c.genre?.coreCastRole) && major) {
    out.push(check('tip', 'genre', 'Core-cast position', d('The story is {genres}. Which core-cast role does she play?', { genres: storyGenres.map((g) => g.label).join(' + ') }), 'Ch. 14'));
  }

  // Azione
  const scenes = c.action?.scenes ?? [];
  if (scenes.some((s) => fin(s.from) && fin(s.to) && s.from === s.to)) {
    out.push(check('warn', 'action', 'A scene doesn’t turn', 'If the value at stake ends where it began, nothing changed: activity, not action.', 'Ch. 15'));
  }
  if (scenes.some((s) => isFilled(s.action) && !isFilled(s.counteraction))) {
    out.push(check('tip', 'action', 'Missing counteraction', 'Her expectation should collide with a surprising counteraction from the world.', 'Ch. 15'));
  }
  if (isProt && !isFilled(c.action?.selfStory?.future)) out.push(check('tip', 'action', 'Her future self-story', 'The story she tells about her future governs her MO — and your plot.', 'Ch. 15'));

  // Performance
  const cu = c.performance?.curiosity;
  const co = c.performance?.concern;
  if (fin(cu) && fin(co) && Math.min(cu, co) <= 3 && Math.max(cu, co) >= 6) {
    out.push(
      check(
        'tip',
        'performance',
        'Suspense is lopsided',
        cu < co ? 'Concern without curiosity becomes mindless longing.' : 'Curiosity without concern turns her into a case study.',
        'Ch. 16',
      ),
    );
  }

  // Relazioni
  const rels = c.relationships ?? [];
  if (major && cast.length > 1 && rels.length === 0) out.push(check('tip', 'relationships', 'Link her to the cast', 'Every cast member draws traits and truths out of every other.', 'Ch. 17'));
  if (isProt && dims.length && cast.length > 1) {
    const activated = new Set<string>();
    for (const other of cast) {
      for (const r of other.relationships ?? []) if (r.targetId === c.id && r.dimensionId) activated.add(r.dimensionId);
    }
    for (const r of rels) if (r.dimensionId) activated.add(r.dimensionId);
    const dormant = dims.filter((x) => !activated.has(x.id));
    if (dormant.length) {
      out.push(
        check(
          'tip',
          'relationships',
          'Dormant dimensions',
          d('{n} dimension(s) aren’t drawn out by any relationship — e.g. {pos}/{neg}. Map a cast member to each, as Austen does with the Bennet sisters.', {
            n: dormant.length,
            pos: dormant[0].positive || '?',
            neg: dormant[0].negative || '?',
          }),
          'Ch. 17',
        ),
      );
    }
  }
  return out;
}

export function castChecks(story: McKeeStory | StoryDesign | null | undefined, cast: McKeeCharacter[], lang = 'en'): McKeeCheck[] {
  const check = checker(lang);
  const out: McKeeCheck[] = [];
  if (!cast.length) return out;
  const prots = cast.filter((c) => c.cast?.circle === 'protagonist');
  if (!prots.length) out.push(check('warn', 'cast', 'No protagonist', 'Design the cast from the star role outward.', 'Ch. 6'));
  const maxDims = Math.max(0, ...cast.map((c) => (c.dimensions ?? []).length));
  for (const p of prots) {
    const pd = (p.dimensions ?? []).length;
    if (pd < maxDims) {
      const rival = cast.find((c) => (c.dimensions ?? []).length === maxDims);
      out.push(
        check(
          'warn',
          'cast',
          'Protagonist out-dimensioned',
          d('{rival} has more dimensions ({max}) than {lead} ({n}). Overly interesting supporting roles may mutiny and take over the telling.', {
            rival: displayName(rival),
            max: maxDims,
            lead: displayName(p),
            n: pd,
          }),
          'Ch. 6, 17',
        ),
      );
    }
  }
  if (!cast.some((c) => c.cast?.circle === 'first')) out.push(check('tip', 'cast', 'Empty first circle', 'Major supporting and servicing players orbit closest to the protagonist.', 'Ch. 6, 17'));
  if (prots.length && !cast.some((c) => (c.cast?.specialRoles ?? []).includes('foil'))) {
    out.push(check('tip', 'cast', 'Consider a foil', 'A foil’s contrasting qualities illuminate — and ground — the protagonist.', 'Ch. 6'));
  }
  const seen = new Map<string, McKeeCharacter>();
  for (const c of cast) {
    if (!c.concept?.roleLabel) continue;
    const key = `${c.cast?.circle}|${c.concept.roleLabel.trim().toLowerCase()}`;
    const prev = seen.get(key);
    if (prev) {
      out.push(
        check(
          'tip',
          'cast',
          'Two roles in one position',
          d('{a} and {b} share role and orbit. No two should take the same position nor perform the same tasks the same way.', { a: displayName(prev), b: displayName(c) }),
          'Ch. 6',
        ),
      );
    } else seen.set(key, c);
  }
  if (story && !(story.genre?.primary ?? []).length) out.push(check('tip', 'cast', 'Choose the story’s genre', 'Genre conventions shape the core cast and what the audience expects.', 'Ch. 14'));
  return out;
}

/* ------------------------------------------------------------------ */
/* Riepiloghi testuali (export e coach)                                */
/* ------------------------------------------------------------------ */

function labelFor(options: { id: string; label: string }[] | undefined, id: unknown): string {
  const o = options?.find((x) => x.id === id);
  return o ? o.label : String(id);
}

/** Ogni campo compilato come coppia [percorso, valore], con le etichette delle opzioni. */
export function flattenFilled(c: McKeeCharacter, M: McKeeData = mckeeData('en')): [string, string | number][] {
  const lines: [string, string | number][] = [];
  const seen = new Set<string>();
  const push = (path: string, value: string | number) => {
    if (seen.has(path)) return;
    seen.add(path);
    lines.push([path, value]);
  };
  for (const section of M.SECTIONS) {
    for (const f of sectionFields(section)) {
      const v = getPath(c, f.path);
      if (f.type === 'custom') continue;
      if (!isFilled(v) && !(f.type === 'slider' && fin(v))) continue;
      if (f.type === 'spectra' || f.type === 'sliders') {
        const obj = v as Record<string, unknown>;
        for (const it of f.items ?? []) if (fin(obj?.[it.id])) push(`${f.path}.${it.id}`, obj[it.id] as number);
      } else if (Array.isArray(v)) {
        push(f.path, v.map((id) => labelFor(f.options, id)).join(', '));
      } else if (f.options) {
        push(f.path, labelFor(f.options, v));
      } else {
        push(f.path, typeof v === 'number' ? v : String(v));
      }
    }
  }
  const expressed = Object.keys(c.outer?.expressed ?? {}).filter((k) => c.outer.expressed[k]);
  if (expressed.length) push('outer.expressed', expressed.join(', '));
  (c.dimensions ?? []).forEach((x, i) => {
    push(
      `dimensions.${i}`,
      `${x.positive || '?'} / ${x.negative || '?'}${x.defining ? ' [DEFINING]' : ''} (id ${x.id}; type ${x.type || '?'}; level ${x.level || '?'})${x.positiveExample ? ` + ${x.positiveExample}` : ''}${x.negativeExample ? ` − ${x.negativeExample}` : ''}`,
    );
  });
  (c.selves?.personae ?? []).forEach((p, i) => push(`selves.personae.${i}`, `${p.with ?? ''}: ${p.persona ?? ''} (${p.axis ?? ''})`));
  for (const f of K.ANTAGONISM_FORCES) {
    const v = c.complexity?.antagonism?.[f.id];
    if (fin(v)) push(`complexity.antagonism.${f.id}`, v);
  }
  if (fin(c.complexity?.capacity)) push('complexity.capacity', c.complexity.capacity);
  (c.arc?.turningPoints ?? []).forEach((x, i) => push(`arc.turningPoints.${i}`, `${x.label ?? ''} (${Number(x.charge) > 0 ? '+' : ''}${x.charge ?? 0})`));
  if (c.arc?.dimensionId) push('arc.dimensionId', c.arc.dimensionId);
  if (c.genre?.coreCastRole) push('genre.coreCastRole', c.genre.coreCastRole);
  if (c.action?.mo?.theme) push('action.mo.theme', labelFor(M.K.MO_THEMES, c.action.mo.theme));
  (c.action?.scenes ?? []).forEach((s, i) =>
    push(
      `action.scenes.${i}`,
      `${s.title || 'Scene'} — wants: ${s.objective || '?'}; does: ${s.action || '?'}; blocked by: ${s.counteraction || '?'}; ${s.value || 'value'} ${s.from ?? '?'}→${s.to ?? '?'}`,
    ),
  );
  return lines;
}

/** Riepilogo completo della costruzione (coach): ogni campo compilato, più storia e cast. */
export function characterDigest(c: McKeeCharacter, story: McKeeStory | null | undefined, cast: McKeeCharacter[] = [], M: McKeeData = mckeeData('en')): string {
  const names = new Map(cast.map((x) => [x.id, displayName(x)]));
  const lines = flattenFilled(c, M).map(([p, v]) => `${p}: ${typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 600) : v}`);
  (c.relationships ?? []).forEach((r, i) => {
    lines.push(`relationships.${i}: ${r.kind || 'link'} → ${names.get(r.targetId ?? '') ?? r.targetId} (id ${r.targetId}; draws out: ${r.draws || '?'})`);
  });
  const header = [`Character "${displayName(c)}" (id ${c.id})`];
  if (story) {
    const g = (story.genre?.primary ?? []).map((id) => M.K.PRIMARY_GENRES.find((x) => x.id === id)?.label).filter(Boolean);
    header.push(`Story: "${story.title}"${story.logline ? ` — ${story.logline}` : ''}${g.length ? ` | genres: ${g.join(', ')}` : ''}${story.theme ? ` | theme: ${story.theme}` : ''}`);
  }
  const others = cast.filter((x) => x.id !== c.id);
  if (others.length) {
    header.push(
      `Other cast: ${others.map((x) => `${displayName(x)} (id ${x.id}; ${x.cast?.circle || 'unplaced'}${x.concept?.roleLabel ? `, ${x.concept.roleLabel}` : ''})`).join('; ')}`,
    );
  }
  return `${header.join('\n')}\n${lines.length ? lines.join('\n') : '(no fields filled yet)'}`;
}
