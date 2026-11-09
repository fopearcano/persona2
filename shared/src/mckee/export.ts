/**
 * Esportazioni Markdown: la "bibbia" del personaggio, ordinata per stazioni, e quella
 * della storia (impianto, cast per orbite, verifiche del cast, poi ogni personaggio).
 */
import { antagonismProfile, castChecks, characterChecks, choiceDepth, overallProgress, traitDensity } from './analysis.js';
import { mckeeData, type McKeeData } from './i18n.js';
import { displayName, getPath, isFilled, type McKeeCharacter, type McKeeStory } from './model.js';
import type { FieldDef, SectionDef } from './sections.js';

const label = (options: { id: string; label: string }[] | undefined, id: unknown) => options?.find((o) => o.id === id)?.label || String(id ?? '');

function fieldLines(M: McKeeData, c: McKeeCharacter, section: SectionDef): string[] {
  const { t, K } = M;
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const g of section.groups) {
    if (g.showIf && !g.showIf(c)) continue;
    const groupLines: string[] = [];
    for (const f of g.fields) {
      if (f.showIf && !f.showIf(c)) continue;
      const v = getPath(c, f.path);
      const name = f.label || K.EXPLICIT_TRAITS.find((x) => x.id === f.key)?.label || f.path;
      if (f.type === 'spectra' || f.type === 'sliders') {
        const obj = (v ?? {}) as Record<string, number>;
        const vals = (f.items ?? []).filter((it) => Number.isFinite(obj[it.id])).map((it) => `${it.label}: ${obj[it.id]}`);
        if (vals.length) groupLines.push(`- **${f.label || t('Ratings')}** — ${vals.join(' · ')}`);
        continue;
      }
      if (f.type === 'custom' || seen.has(f.path)) continue;
      seen.add(f.path);
      if (f.type === 'slider' ? !Number.isFinite(v) : !isFilled(v)) continue;
      let shown: unknown = v;
      if (Array.isArray(v)) shown = v.map((id) => label(f.options, id)).join(', ');
      else if (f.options) shown = label(f.options, v);
      else if (typeof v === 'boolean') shown = v ? t('Yes') : t('No');
      const mark = f.type === 'trait' && f.key && c.outer?.expressed?.[f.key] ? ' 👁' : '';
      groupLines.push(`- **${name}**${mark} — ${String(shown).replace(/\n+/g, ' ')}`);
    }
    if (groupLines.length) lines.push(`**${g.title}**`, ...groupLines, '');
  }
  return lines;
}

const footer = (M: McKeeData) => [
  '---',
  `*${M.t('Built with PERSONA · framework after Robert McKee, {title} ({year}).', { title: M.K.BOOK.title, year: M.K.BOOK.year })}*`,
];

/** Abbassa i titoli di `by` livelli (# → ##) per annidare una bibbia in un'altra. */
const nest = (md: string, by: number) => md.replace(/^(#{1,5}) /gm, (_m, h: string) => `${h}${'#'.repeat(by)} `);

export function characterMarkdown(
  c: McKeeCharacter,
  story: McKeeStory | null,
  cast: McKeeCharacter[] = [],
  { lang = 'en', withFooter = true }: { lang?: string; withFooter?: boolean } = {},
): string {
  const M = mckeeData(lang);
  const { t, K } = M;
  const out: string[] = [];
  const p = overallProgress(c, story);
  out.push(`# ${displayName(c)}`);
  if (c.concept?.logline) out.push('', `> ${c.concept.logline}`);
  out.push(
    '',
    `*${c.cast?.circle ? label(K.CIRCLES, c.cast.circle) : t('Unplaced')}${c.concept?.roleLabel ? ` · ${c.concept.roleLabel}` : ''}${story ? ` · ${story.title}` : ''} · ${t('{pct}% built', { pct: Math.round(p.ratio * 100) })}*`,
    '',
  );

  const td = traitDensity(c);
  const ap = antagonismProfile(c);
  const cd = choiceDepth(c);
  out.push(`## ${t('At a glance')}`, '');
  const def = c.dimensions?.find((d) => d.defining);
  out.push(`- ${t('Dimensions')}: ${(c.dimensions ?? []).length}${def ? ` (${t('defining: {pos} / {neg}', { pos: def.positive, neg: def.negative })})` : ''}`);
  out.push(`- ${t('Trait density: {shown} dramatized of {known} known (McKee’s ideal ≈ 3/10)', { shown: td.expressed, known: td.known })}`);
  if (ap.capacity != null) {
    out.push(`- ${t('Underdog balance: antagonism {power} vs. capacity {capacity}', { power: ap.power, capacity: ap.capacity })}${ap.underdog ? ` — ${t('underdog ✓')}` : ''}`);
  }
  if (cd != null) out.push(`- ${t('Choice depth: {n}/10', { n: cd })}`);
  out.push('');

  for (const s of M.SECTIONS) {
    const body = fieldLines(M, c, s);
    const extra: string[] = [];
    if (s.id === 'selves' && c.selves?.personae?.length) {
      extra.push(
        `**${t('Personae')}**`,
        ...c.selves.personae.map(
          (x) => `- ${t('with {who}', { who: x.with })} (${x.axis ? (x.axis === 'power' ? t('Power (social)') : t('Intimacy (personal)')) : '—'}): ${x.persona ?? ''}`,
        ),
        '',
      );
    }
    if (s.id === 'dimensions' && c.dimensions?.length) {
      extra.push(
        ...c.dimensions.map(
          (d) =>
            `- **${d.positive ?? '?'} / ${d.negative ?? '?'}**${d.defining ? ` — *${t('defining')}*` : ''}${d.type ? ` · ${label(K.DIMENSION_TYPES, d.type)}` : ''}${d.level ? ` · ${label(K.SELF_LEVELS, d.level)}` : ''}${d.positiveExample ? `\n  - (+) ${d.positiveExample}` : ''}${d.negativeExample ? `\n  - (−) ${d.negativeExample}` : ''}`,
        ),
        '',
      );
    }
    if (s.id === 'complexity') {
      const forces = ap.forces.filter((f) => f.value > 0);
      if (forces.length) {
        const localized = (id: string) => K.ANTAGONISM_FORCES.find((f) => f.id === id)?.label ?? id;
        extra.push(
          `**${t('Forces of antagonism')}**`,
          ...forces.map((f) => `- ${localized(f.id)}: ${f.value}/10${c.complexity?.antagonismNotes?.[f.id] ? ` — ${c.complexity.antagonismNotes[f.id]}` : ''}`),
          '',
        );
      }
    }
    if (s.id === 'arc' && c.arc?.turningPoints?.length) {
      extra.push(`**${t('Turning points')}**`, ...c.arc.turningPoints.map((x, i) => `${i + 1}. ${x.label ?? ''} (${Number(x.charge) > 0 ? '+' : ''}${x.charge ?? 0})`), '');
    }
    if (s.id === 'action' && c.action?.scenes?.length) {
      extra.push(
        `**${t('Scenes')}**`,
        ...c.action.scenes.map(
          (sc) =>
            `- **${sc.title || t('Scene')}** — ${t('wants {objective}; does {action}; blocked by {counteraction}', { objective: sc.objective || '?', action: sc.action || '?', counteraction: sc.counteraction || '?' })}; ${sc.value || t('value')} ${sc.from ?? '?'} → ${sc.to ?? '?'}`,
        ),
        '',
      );
    }
    if (s.id === 'action' && c.action?.mo?.theme) extra.unshift(`- **${t('MO theme')}** — ${label(K.MO_THEMES, c.action.mo.theme)}`);
    if (s.id === 'genre' && c.genre?.coreCastRole) extra.unshift(`- **${t('Core-cast position')}** — ${t(c.genre.coreCastRole)}`);
    if (s.id === 'relationships' && c.relationships?.length) {
      extra.push(
        ...c.relationships.map((r) => {
          const other = cast.find((x) => x.id === r.targetId);
          const dim = c.dimensions?.find((d) => d.id === r.dimensionId);
          return `- ${(r.kind && label(K.RELATIONSHIP_KINDS, r.kind)) || t('Link')} → **${other ? displayName(other) : (r.targetId ?? '?')}**${r.draws ? `: ${t('draws out {what}', { what: r.draws })}` : ''}${dim ? ` (${dim.positive}/${dim.negative})` : ''}`;
        }),
        '',
      );
    }
    if (!body.length && !extra.length) continue;
    out.push(`## ${s.num} · ${s.title}`, `*${s.subtitle} — McKee, ${t('Ch. {n}', { n: s.chapters.join(', ') })}*`, '', ...body, ...extra);
  }

  const checks = characterChecks(c, story, cast, M.lang).filter((x) => x.level !== 'good');
  if (checks.length) out.push(`## ${t('Open McKee checks')}`, '', ...checks.map((x) => `- **${x.title}** — ${x.detail} (${x.ref})`), '');
  if (withFooter) out.push(...footer(M));
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function storyFieldValue(M: McKeeData, f: FieldDef, story: McKeeStory): string {
  const v = getPath(story, f.path);
  if (f.component === 'genrePicker') {
    return ((v as string[]) ?? [])
      .map((id) => M.K.PRIMARY_GENRES.find((g) => g.id === id))
      .filter((g) => !!g)
      .map((g) => `${g.label} (${g.coreValue})`)
      .join(', ');
  }
  if (!isFilled(v)) return '';
  if (Array.isArray(v)) return v.map((id) => label(f.options, id)).join(', ');
  if (f.options) return label(f.options, v);
  return String(v).replace(/\n+/g, ' ');
}

/** L'intera storia: impianto, cast per orbita, verifiche del cast, poi un capitolo per personaggio. */
export function storyMarkdown(story: McKeeStory, cast: McKeeCharacter[] = [], { lang = 'en' }: { lang?: string } = {}): string {
  const M = mckeeData(lang);
  const { t, K } = M;
  const order: Record<string, number> = { protagonist: 0, first: 1, second: 2, third: 3 };
  const sorted = [...cast].sort((a, b) => (order[a.cast?.circle] ?? 4) - (order[b.cast?.circle] ?? 4));
  const out = [`# ${story.title}`];
  if (story.logline) out.push('', `> ${story.logline}`);
  out.push('', `*${[story.format, t('{n} characters', { n: cast.length })].filter(Boolean).join(' · ')}*`, '');

  const settings = M.STORY_FIELDS.filter((f) => f.path !== 'logline')
    .map((f) => [f.label ?? f.path, storyFieldValue(M, f, story)] as const)
    .filter(([, v]) => v);
  if (settings.length) out.push(`## ${t('Story settings')}`, '', ...settings.map(([k, v]) => `- **${k}** — ${v}`), '');

  if (sorted.length) {
    out.push(`## ${t('Cast')}`, '');
    for (const circle of [...K.CIRCLES, { id: '', label: t('Unplaced') }]) {
      const members = sorted.filter((c) => (c.cast?.circle || '') === circle.id);
      if (members.length) {
        out.push(`- **${circle.label}** — ${members.map((c) => `${displayName(c)}${c.concept?.roleLabel ? ` (${c.concept.roleLabel})` : ''}`).join(', ')}`);
      }
    }
    out.push('');
  }
  const checks = castChecks(story, cast, M.lang).filter((x) => x.level !== 'good');
  if (checks.length) out.push(`## ${t('Cast design checks')}`, '', ...checks.map((x) => `- **${x.title}** — ${x.detail} (${x.ref})`), '');

  for (const c of sorted) out.push(nest(characterMarkdown(c, story, cast, { lang, withFooter: false }), 1), '');
  out.push(...footer(M));
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
