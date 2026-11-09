/**
 * Il profilo McKee nel contesto delle conversazioni.
 *
 * Per dare voce al personaggio servono solo le parti "dall'interno": tratti osservabili,
 * sé, motivazioni e desideri, contraddizioni, sottotesto, racconto di sé, modus operandi,
 * relazioni. Le parti da autore (arco, climax, simbolo, genere, funzioni di performance,
 * scene pianificate) restano fuori: il personaggio non conosce la propria storia futura.
 * Il sé nascosto e il desiderio inconscio entrano come materiale "sotto la consapevolezza":
 * guidano il comportamento ma il personaggio non li dichiara mai.
 *
 * Etichette in inglese (come tutte le istruzioni di PERSONA); i valori restano nella
 * lingua in cui l'autore li ha scritti.
 */
import * as K from './catalog.js';
import { flattenFilled } from './analysis.js';
import { mckeeData } from './i18n.js';
import { isFilled, type CharacterBuild } from './model.js';

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const line = (label: string, value: unknown) => (isFilled(value) ? `${label}: ${clean(value)}` : null);
const label = (options: { id: string; label: string }[], id: string | undefined) => options.find((o) => o.id === id)?.label ?? null;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function lean(left: string | undefined, right: string | undefined, v: number, max: number): string {
  const strength = Math.abs(v) / max;
  const word = strength >= 0.7 ? 'strongly' : strength >= 0.35 ? 'clearly' : 'slightly';
  if (v === 0) return `balanced between ${left} and ${right}`;
  return `${word} ${v > 0 ? right : left}`;
}

function spectrum(items: { id: string; left?: string; right?: string }[], values: Record<string, number> | undefined, max = 5): string[] {
  return items.filter((it) => fin(values?.[it.id])).map((it) => lean(it.left, it.right, values![it.id], max));
}

function block(title: string, lines: (string | null | undefined)[]): string | null {
  const body = lines.filter((l): l is string => !!l);
  return body.length ? `## ${title}\n${body.join('\n')}` : null;
}

export interface ProfileOptions {
  name: string;
  /** Nomi dei personaggi a cui puntano le relazioni. */
  names?: Map<string, string>;
}

/** Sezione del prompt "in personaggio" (null se la costruzione è vuota o disattivata). */
export function characterDesignSection(b: CharacterBuild, opts: ProfileOptions): string | null {
  if (!b.useInContext) return null;
  const { name } = opts;
  const ex = b.outer.explicit;
  const im = b.outer.implicit;

  const role = block('Role', [
    b.cast.circle ? `Place in the story's cast: ${label(K.CIRCLES, b.cast.circle)}${b.concept.roleLabel ? ` — ${clean(b.concept.roleLabel)}` : ''}` : line('Role', b.concept.roleLabel),
    line('Also known as', b.concept.nickname),
    line('In one line', b.concept.logline),
  ]);

  const observable = block('What others observe', [
    ...K.EXPLICIT_TRAITS.filter((t) => t.id !== 'nameMeaning' && t.id !== 'age').map((t) => line(t.label, ex[t.id])),
    line('Name and what it connotes', ex.nameMeaning),
  ]);

  const authority = fin(im.authority) ? `Toward authority: ${lean('authoritarian', 'anti-authoritarian', im.authority, 5)}` : null;
  const outlook = fin(im.outlook) ? `Outlook: ${lean('pessimist', 'optimist', im.outlook, 5)}` : null;
  const flex = fin(im.flexibility) ? `Mental flexibility: ${im.flexibility}/10` : null;
  const mind = block('Mind, attitudes, temperament', [
    line('Habits of thought', im.habitsOfThought),
    flex,
    line('Likes and loves', im.likes),
    line('Dislikes and hates', im.dislikes),
    line('Fears and dreads', im.fears),
    outlook,
    authority,
    line('Prevailing mood', im.mood),
    line('Childhood temperament (still follows like a shadow)', im.temperament),
    line(`Asked "Who are you?", ${name} says`, im.whoAreYou),
    line('What they wish to achieve', im.achieve),
    line('What they feel they must do', im.mustDo),
    line('What they must never do', im.mustNever),
    im.humanNature ? `Believes human nature is: ${label(K.HUMAN_NATURE_VIEWS, im.humanNature)}` : null,
    line('How they explain the face in the mirror', im.mirror),
  ]);

  const st = b.outer.setting;
  const world = block('World that shaped them', [
    line('Social setting and the price of belonging', st.social),
    line('Personal setting (intimates)', st.personal),
    line('Cultural restraints', st.restraints),
    line('Values charged in their world', st.values),
    line('Their shell (things they call their own)', st.extendedSelf),
  ]);

  const personae = b.selves.personae.filter((p) => isFilled(p.with) && isFilled(p.persona)).map((p) => `- With ${clean(p.with)}: ${clean(p.persona)}`);
  const selves = block('Selves', [
    line('Social self (work, public, power)', b.selves.social),
    line('Personal self (family, friends, lovers)', b.selves.personal),
    line('Core self (private: observes, decides, judges)', b.selves.core),
    personae.length ? `Masks they wear (voice, eyes, posture shift with power and intimacy):\n${personae.join('\n')}` : null,
  ]);

  const mot = b.inner.motivations;
  const drives = K.MOTIVATIONS.filter((m) => fin(mot[m.id]) && mot[m.id] > 0)
    .sort((a, c) => mot[c.id] - mot[a.id])
    .slice(0, 4)
    .map((m) => `${m.label} (${mot[m.id]}/10)`);
  const desire = block('What pushes and pulls them', [
    drives.length ? `Strongest drives: ${drives.join(', ')}${b.inner.moreKind ? ` — "more" as ${label(K.MORE_KINDS, b.inner.moreKind)?.toLowerCase()}` : ''}` : null,
    line('Social forces at work on them', b.inner.outsideIn),
    line('Repeated experiences that left residues', b.inner.backstory.patterns),
    line('Early adolescence', b.inner.backstory.adolescence),
    line('How their identity solidified', b.inner.backstory.identity),
    line('The event that threw their life off balance', b.inner.incitingIncident),
    line('Super-objective (what would restore balance)', b.inner.superObjective),
    line('What they consciously want', b.inner.objectOfDesire),
  ]);

  const values = spectrum(K.VALUE_SPECTRA, b.inner.values);
  const emotions = spectrum(K.EMOTION_PAIRS, b.inner.emotions);
  const feelings = spectrum(K.FEELINGS, b.inner.feelings);
  const dl = b.inner.dilemma;
  const pressure = block('Under pressure', [
    isFilled(dl.optionA) && isFilled(dl.optionB) ? `The dilemma they face: ${clean(dl.optionA)} — versus — ${clean(dl.optionB)}` : null,
    values.length ? `Values under pressure: ${values.join('; ')}` : null,
    emotions.length ? `Emotional range: ${emotions.join('; ')}` : null,
    line('How their manner shades emotion', b.inner.emotionStyle),
    feelings.length ? `Background feelings: ${feelings.join('; ')}` : null,
    line('Signature reactions', b.inner.reactions),
    b.inner.decisionPath ? `Usually decides by: ${label(K.DECISION_PATHS, b.inner.decisionPath)}` : null,
  ]);

  const dims = b.dimensions
    .filter((d) => isFilled(d.positive) && isFilled(d.negative))
    .sort((a, c) => Number(!!c.defining) - Number(!!a.defining))
    .map(
      (d) =>
        `- ${clean(d.positive)} / ${clean(d.negative)}${d.defining ? ' (DEFINING: without it they would be someone else)' : ''}${d.positiveExample ? `; (+) ${clean(d.positiveExample)}` : ''}${d.negativeExample ? `; (−) ${clean(d.negativeExample)}` : ''}`,
    );
  const contradictions = dims.length
    ? `## Living contradictions (consistent patterns — show both poles over time, never resolve them)\n${dims.join('\n')}`
    : null;

  const sub = b.complexity.subtext;
  const subtext = block('Text and subtext', [
    line('What they say and do', sub.text),
    line('What they think and feel but never say', sub.sub),
    line('Secrets they guard', b.complexity.secrets),
  ]);

  const hidden = block(`Below awareness (${name} does not know this: never state it, let it leak through contradiction, deflection and what they avoid)`, [
    line('Hidden self', b.selves.hidden),
    line('Subconscious desire', b.complexity.subconsciousDesire),
    line('What they cannot know about themselves', sub.unsayable),
  ]);

  const ss = b.action.selfStory;
  const mo = b.action.mo;
  const action = block('Self-story and tactics (all statements of self are self-serving)', [
    line('How they explain who they became', ss.past),
    line('Their reading of where they stand now', ss.present),
    line('The future they wish for', ss.future),
    mo.theme ? `Modus operandi: ${label(K.MO_THEMES, mo.theme)}${mo.description ? ` — ${clean(mo.description)}` : ''}` : line('Modus operandi', mo.description),
    line('Sense of probability', b.action.probability),
  ]);

  const rels = b.relationships
    .filter((r) => r.targetId && opts.names?.has(r.targetId))
    .map((r) => {
      const who = opts.names!.get(r.targetId!)!;
      const kind = label(K.RELATIONSHIP_KINDS, r.kind);
      const effect = label(K.RELATIONSHIP_EFFECTS, r.effect);
      return `- ${who}${kind ? ` (${kind.toLowerCase()}${effect ? `, ${effect.toLowerCase()}` : ''})` : ''}${r.draws ? `: draws out ${clean(r.draws)}` : ''}${r.bringsOut ? `; ${name} brings out ${clean(r.bringsOut)}` : ''}`;
    });
  const relationships = rels.length ? `## People in their story\n${rels.join('\n')}` : null;

  const parts = [role, observable, mind, world, selves, desire, pressure, contradictions, subtext, action, relationships, hidden].filter(Boolean);
  if (!parts.length) return null;
  return `# CHARACTER DESIGN (canonical, from the author's build after McKee's CHARACTER)
This is how ${name} works inside. Let it drive choices, reactions and subtext; never recite it or name its categories.

${parts.join('\n\n')}`;
}

/** Sezione per l'analisi esterna: l'intera costruzione, comprese le scelte d'autore. */
export function characterDesignForAnalysis(b: CharacterBuild, opts: ProfileOptions): string | null {
  const M = mckeeData('en');
  const lines = flattenFilled({ ...b, id: '', name: opts.name }, M).map(([p, v]) => `${p}: ${typeof v === 'string' ? clean(v).slice(0, 600) : v}`);
  b.relationships.forEach((r) => {
    const who = r.targetId ? (opts.names?.get(r.targetId) ?? r.targetId) : '?';
    lines.push(`relationship → ${who}: ${r.kind || 'link'}${r.draws ? `, draws out ${clean(r.draws)}` : ''}`);
  });
  if (!lines.length) return null;
  return `# CHARACTER DESIGN (author's McKee build, including author-only choices such as arc and symbolism)\n${lines.join('\n')}`;
}
