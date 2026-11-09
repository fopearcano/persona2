/**
 * Infografiche delle stazioni McKee (da CharBuild), in SVG con i token di colore di PERSONA:
 * funzionano nei temi chiaro e scuro e seguono il colore d'accento scelto dall'utente.
 */
import type { CastMember } from '@persona/shared/client';
import {
  antagonismProfile,
  choiceDepth,
  definingDimension,
  initials,
  isFilled,
  overallProgress,
  suspenseScore,
  traitDensity as traitDensityData,
  type McKeeCharacter,
  type McKeeData,
  type StoryDesign,
} from '@persona/shared/mckee';
import { type ReactNode, useRef, useState } from 'react';
import { cx as cn } from '../ui';
import { fin, trunc } from '../../lib/mckee';

export interface VizCtx {
  M: McKeeData;
  /** Impianto della storia di riferimento (con il titolo, se noto). */
  story: (StoryDesign & { title?: string }) | null;
  cast: CastMember[];
  /** Trascinamento dei punti di svolta (solo nel costruttore). */
  onTurningPoint?(index: number, charge: number): void;
  onOpenCharacter?(id: string): void;
}

const deg = (a: number) => (a * Math.PI) / 180;
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + r * Math.cos(deg(a)), cy + r * Math.sin(deg(a))];
const f1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown, d = 0) => (fin(v) ? v : d);
const anchorOf = (x: number, cx: number, tol = 8) => (Math.abs(x - cx) < tol ? 'middle' : x > cx ? 'start' : 'end');

export function VizCard({ title, sub, children, className }: { title: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-panel', className)}>
      <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        {sub && <span className="text-[11px] text-muted">{sub}</span>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Svg({ w, h, label, children, className }: { w: number; h: number; label: string; children: ReactNode; className?: string }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className={cn('mx-auto block h-auto w-full max-w-[22rem] select-none', className)}>
      {children}
    </svg>
  );
}

// Classi complete (Tailwind non riconosce nomi composti a runtime).
const TONE_FILL = { ok: 'fill-ok', danger: 'fill-danger', warn: 'fill-warn' } as const;
const TONE_STROKE = { ok: 'stroke-ok', danger: 'stroke-danger', warn: 'stroke-warn' } as const;

const Empty = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted italic">{children}</p>;
const Note = ({ children, good }: { children: ReactNode; good?: boolean }) => <p className={cn('mt-2 text-xs', good ? 'text-ok' : 'text-muted')}>{children}</p>;

export function ProgressRing({ ratio, size = 44, label }: { ratio: number; size?: number; label: string }) {
  const stroke = Math.max(4, size / 10);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-border" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className="stroke-accent"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${f1(c * ratio)} ${f1(c)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-text font-semibold" fontSize={size * 0.27}>
        {pct}%
      </text>
    </svg>
  );
}

export function HBar({ label, value, max = 10, alt }: { label: string; value: unknown; max?: number; alt?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
        <span className={cn('block h-full rounded-full', alt ? 'bg-analysis' : 'bg-accent')} style={{ width: `${(num(value) / max) * 100}%` }} />
      </span>
      <span className="w-6 text-right font-mono text-muted tabular-nums">{fin(value) ? value : '—'}</span>
    </div>
  );
}

export function Diverging({ rows, max = 5 }: { rows: { left?: string; right?: string; value: unknown }[]; max?: number }) {
  const w = 360;
  const rowH = 26;
  const mid = w / 2;
  const scale = (w / 2 - 104) / max;
  return (
    <Svg w={w} h={rows.length * rowH + 6} label="">
      {rows.map((r, i) => {
        const y = i * rowH + 14;
        const v = fin(r.value) ? r.value : null;
        const len = v == null ? 0 : Math.abs(v) * scale;
        const x = v == null ? mid : v < 0 ? mid - len : mid;
        return (
          <g key={i}>
            <text x={4} y={y + 4} fontSize={10} className={v != null && v < 0 ? 'fill-text' : 'fill-muted'}>
              {r.left}
            </text>
            <text x={w - 4} y={y + 4} fontSize={10} textAnchor="end" className={v != null && v > 0 ? 'fill-text' : 'fill-muted'}>
              {r.right}
            </text>
            <line x1={mid - max * scale} x2={mid + max * scale} y1={y} y2={y} className="stroke-border" strokeWidth={2} />
            {v == null ? <circle cx={mid} cy={y} r={2.5} className="fill-border" /> : <rect x={f1(x)} y={y - 5} width={f1(Math.max(len, 2))} height={10} rx={3} className={v < 0 ? 'fill-danger/70' : 'fill-ok/70'} />}
          </g>
        );
      })}
      <line x1={mid} x2={mid} y1={2} y2={rows.length * rowH + 2} className="stroke-muted" strokeDasharray="2 3" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* 01 · Scintilla                                                      */
/* ------------------------------------------------------------------ */

function SparkSpheres({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t } = ctx.M;
  const sel = new Set(c.concept.inspiration);
  const rings = [
    { label: t('Actuality'), on: sel.has('reality') },
    { label: t('Media'), on: sel.has('medium') },
    { label: t('Genre'), on: sel.has('genre') },
    { label: t('Story · events, theme, past'), on: ['events', 'theme', 'biography', 'selfStory'].some((s) => sel.has(s)) },
    { label: t('Author'), on: sel.has('insideOut') || c.concept.approach === 'insideOut' || c.concept.approach === 'alternating' },
  ];
  return (
    <>
      <VizCard title={t('Five spheres of inspiration')} sub={t('Ch. {n}', { n: 4 })}>
        <Svg w={320} h={300} label={t('Spheres of inspiration')}>
          {rings.map((rg, i) => (
            <circle key={i} cx={160} cy={150} r={140 - i * 27} className={rg.on ? 'fill-accent/10 stroke-accent' : 'fill-transparent stroke-border'} strokeWidth={rg.on ? 2 : 1} />
          ))}
          {rings.map((rg, i) => (
            <text key={`t${i}`} x={160} y={150 - (140 - i * 27) + 15} textAnchor="middle" fontSize={10} className={rg.on ? 'fill-accent font-medium' : 'fill-muted'}>
              {rg.label}
            </text>
          ))}
          <circle cx={160} cy={150} r={10} className="fill-accent" />
        </Svg>
      </VizCard>
      <VizCard title={t('The spark')}>
        {c.concept.tellingDetail ? <p className="font-text text-sm italic">“{trunc(c.concept.tellingDetail, 220)}”</p> : <Empty>{t('Add the telling detail — the facet that implies a whole humanity.')}</Empty>}
        {c.concept.magicIf && (
          <p className="mt-2 text-xs">
            <b>{t('Magic If')}</b> {trunc(c.concept.magicIf, 200)}
          </p>
        )}
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 02 · Ruolo                                                          */
/* ------------------------------------------------------------------ */

function CastOrbit({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const cast: { id: string; name: string; circle: string }[] = [
    { id: c.id, name: c.name, circle: c.cast.circle },
    ...ctx.cast.map((m) => ({ id: m.id, name: m.name, circle: m.build.cast.circle })),
  ];
  const radii = [0, 62, 104, 142];
  const byRing: Record<number, typeof cast> = { 1: [], 2: [], 3: [] };
  for (const m of cast) {
    const ring = K.CIRCLES.find((x) => x.id === m.circle)?.ring;
    if (ring) byRing[ring].push(m);
  }
  const prots = cast.filter((m) => m.circle === 'protagonist');
  const ess = new Set(c.cast.essentials);
  const isProt = c.cast.circle === 'protagonist' || !c.cast.circle;
  return (
    <>
      <VizCard title={t('The cast as a solar system')} sub={t('Ch. {n}', { n: 6 })}>
        <Svg w={320} h={320} label={t('Cast orbit')}>
          {radii.slice(1).map((r, i) => (
            <g key={r}>
              <circle cx={160} cy={160} r={r} className="fill-none stroke-border" strokeDasharray="3 4" />
              <text x={160 + r - 4} y={156} textAnchor="end" fontSize={9} className="fill-muted">
                {[t('1st'), t('2nd'), t('3rd')][i]}
              </text>
            </g>
          ))}
          <circle cx={160} cy={160} r={26} className="fill-accent/20 stroke-accent" />
          <text x={160} y={164} textAnchor="middle" fontSize={10} className="fill-text font-medium">
            {trunc(prots[0]?.name ?? t('Protagonist'), 12)}
          </text>
          {c.cast.circle === 'protagonist' && <circle cx={160} cy={160} r={31} className="fill-none stroke-accent" strokeWidth={2} />}
          {Object.entries(byRing).flatMap(([ring, members]) =>
            members.map((m, i) => {
              const a = (360 / Math.max(members.length, 1)) * i - 90 + Number(ring) * 25;
              const [x, y] = polar(160, 160, radii[Number(ring)], a);
              const me = m.id === c.id;
              return (
                <g key={m.id}>
                  <circle cx={f1(x)} cy={f1(y)} r={me ? 10 : 6} className={me ? 'fill-accent' : 'fill-muted/60'}>
                    <title>{m.name}</title>
                  </circle>
                  {me && (
                    <text x={f1(x)} y={f1(y + 22)} textAnchor="middle" fontSize={10} className="fill-text">
                      {trunc(m.name, 16)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </Svg>
      </VizCard>
      {isProt && (
        <VizCard title={t('Protagonist essentials')} sub={`${ess.size}/8`}>
          <div className="grid grid-cols-2 gap-1">
            {K.PROTAGONIST_ESSENTIALS.map((e, i) => (
              <div key={e.id} title={e.desc} className={cn('flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px]', ess.has(e.id) ? 'border-accent/50 bg-accent-soft text-accent' : 'border-border text-muted')}>
                <span className="font-mono">{i + 1}</span>
                {e.label}
              </div>
            ))}
          </div>
          {c.cast.centerOfGood && (
            <p className="mt-2 text-xs">
              <b>{t('Center of Good')}</b> — {trunc(c.cast.centerOfGood, 160)}
            </p>
          )}
        </VizCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 03 · Tratti espliciti                                               */
/* ------------------------------------------------------------------ */

function TraitCanvas({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const td = traitDensityData(c);
  const pct = Math.round(td.expressedRatio * 100);
  const spectra = [...K.PUBLIC_SPECTRA, ...K.PRIVATE_SPECTRA];
  const sp = c.outer.spectra;
  return (
    <>
      <VizCard title={t('Trait canvas')} sub={t('{pct}% dramatized', { pct })}>
        <div className="grid grid-cols-6 gap-1">
          {K.EXPLICIT_TRAITS.map((tr) => {
            const known = td.knownKeys.includes(tr.id);
            const shown = td.expressedKeys.includes(tr.id);
            return (
              <div
                key={tr.id}
                title={`${tr.label} — ${shown ? t('dramatized') : known ? t('known to author') : t('unknown')}`}
                className={cn('flex h-9 items-center justify-center rounded px-0.5 text-center text-[9px] leading-tight', shown ? 'bg-accent text-accent-fg' : known ? 'bg-accent-soft text-accent' : 'bg-panel-2 text-muted')}
              >
                {tr.short || tr.label}
              </div>
            );
          })}
        </div>
        <div className="relative mt-3 h-2 rounded-full bg-panel-2" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('Dramatized {pct}% of known traits', { pct })}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
          <div className="absolute -top-1 h-4 border-l-2 border-text" style={{ left: '30%' }} />
          <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-muted" style={{ left: '30%' }}>
            3/10
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          <span>{t('{n} dramatized', { n: td.expressed })}</span>
          <span>{t('{n} known', { n: td.known })}</span>
          <span>{t('{n} unknown', { n: td.total - td.known })}</span>
        </div>
        <Note>{t('McKee: leave about seven-tenths of a protagonist unknown; the audience fills in the rest.')}</Note>
      </VizCard>
      {spectra.some((s) => fin(sp[s.id])) && (
        <VizCard title={t('Public & private spectra')}>
          <Diverging rows={spectra.map((s) => ({ left: s.left, right: s.right, value: sp[s.id] }))} />
        </VizCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 04 · Tratti impliciti                                               */
/* ------------------------------------------------------------------ */

function BigFiveRadar({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const bf = c.outer.implicit.bigFive;
  const cx = 190;
  const cy = 150;
  const R = 100;
  const n = K.BIG_FIVE.length;
  const angle = (i: number) => -90 + (360 / n) * i;
  const set = K.BIG_FIVE.some((tr) => fin(bf[tr.id]));
  const pts = K.BIG_FIVE.map((tr, i) => polar(cx, cy, R * (num(bf[tr.id], 50) / 100), angle(i)));
  return (
    <>
      <VizCard title={t('Five galaxies of personality')} sub={t('Ch. {n}', { n: 7 })}>
        <Svg w={380} h={300} label={t('Personality radar')}>
          {[0.25, 0.5, 0.75, 1].map((k) => (
            <polygon key={k} points={K.BIG_FIVE.map((_, i) => polar(cx, cy, R * k, angle(i)).map(f1).join(',')).join(' ')} className="fill-none stroke-border" />
          ))}
          {K.BIG_FIVE.map((tr, i) => {
            const [x, y] = polar(cx, cy, R, angle(i));
            const [lx, ly] = polar(cx, cy, R + 22, angle(i));
            const v = bf[tr.id];
            return (
              <g key={tr.id}>
                <line x1={cx} y1={cy} x2={f1(x)} y2={f1(y)} className="stroke-border" />
                <text x={f1(lx)} y={f1(ly)} textAnchor={anchorOf(lx, cx)} dominantBaseline="middle" fontSize={10} className="fill-muted">
                  {fin(v) ? (v >= 50 ? tr.right : tr.left) : tr.label}
                </text>
              </g>
            );
          })}
          {set && (
            <>
              <polygon points={pts.map((p) => p.map(f1).join(',')).join(' ')} className="fill-accent/20 stroke-accent" strokeWidth={2} />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={f1(x)} cy={f1(y)} r={3.5} className="fill-accent" />
              ))}
            </>
          )}
        </Svg>
        {!set && <Empty>{t('Move the sliders to draw her personality.')}</Empty>}
      </VizCard>
      <VizCard title={t('Intelligences')}>
        <div className="flex flex-col gap-1.5">
          {K.INTELLIGENCES.map((k) => (
            <HBar key={k.id} label={k.label} value={c.outer.implicit.intelligence[k.id]} />
          ))}
        </div>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 05 · Mondo                                                          */
/* ------------------------------------------------------------------ */

function SettingRings({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const s = c.outer.setting;
  const levels = new Set(s.levels);
  const rings = [
    { id: 'physical', text: s.physical },
    { id: 'social', text: s.social },
    { id: 'personal', text: s.personal },
    { id: 'inner', text: '' },
  ];
  const rel = K.SETTING_RELATIONS.find((x) => x.id === s.relation);
  const exp = c.outer.expression;
  return (
    <>
      <VizCard title={t('Levels of conflict in her world')} sub={t('Ch. {n}', { n: 7 })}>
        <Svg w={320} h={300} label={t('Setting rings')}>
          {rings.map((r, i) => {
            const on = levels.has(r.id) || isFilled(r.text);
            const rad = 138 - i * 32;
            return (
              <g key={r.id}>
                <circle cx={160} cy={150} r={rad} className={on ? 'fill-accent/10 stroke-accent' : 'fill-transparent stroke-border'} />
                <text x={160} y={150 - rad + 18} textAnchor="middle" fontSize={10} className={on ? 'fill-accent font-medium' : 'fill-muted'}>
                  {K.CONFLICT_LEVELS.find((l) => l.id === r.id)?.label}
                </text>
              </g>
            );
          })}
          <circle cx={160} cy={150} r={30} className="fill-accent" />
          <text x={160} y={154} textAnchor="middle" fontSize={11} className="fill-accent-fg font-semibold">
            {initials(c.name)}
          </text>
        </Svg>
        {rel && (
          <Note>
            <b>{rel.label}</b> — {rel.desc}
          </Note>
        )}
      </VizCard>
      <VizCard title={t('Nine ways to express her')} sub={`${K.EXPRESSION_TECHNIQUES.filter((q) => isFilled(exp[q.id])).length}/9`}>
        <div className="flex flex-wrap gap-1">
          {K.EXPRESSION_TECHNIQUES.map((q) => (
            <span key={q.id} title={exp[q.id] || q.desc} className={cn('rounded border px-1.5 py-px text-[11px]', isFilled(exp[q.id]) ? 'border-accent/50 bg-accent-soft text-accent' : 'border-border text-muted')}>
              {q.label}
            </span>
          ))}
        </div>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 06 · Quattro sé                                                     */
/* ------------------------------------------------------------------ */

export function FourSelves({ c, ctx, compact }: { c: McKeeCharacter; ctx: VizCtx; compact?: boolean }) {
  const { t, K, tn } = ctx.M;
  const sv = c.selves as unknown as Record<string, string>;
  const rings = [
    { id: 'social', r: 140 },
    { id: 'personal', r: 106 },
    { id: 'core', r: 72 },
    { id: 'hidden', r: 38 },
  ];
  const personae = c.selves.personae.length;
  return (
    <VizCard title={t('Four selves in search of a character')} sub={`${t('Ch. {n}', { n: 5 })}${personae ? ` · ${tn(personae, '{n} persona', '{n} personae')}` : ''}`}>
      <Svg w={300} h={300} label={t('Four selves')}>
        {rings.map((rg, i) => (
          <circle key={rg.id} cx={150} cy={150} r={rg.r} className={isFilled(sv[rg.id]) ? (i === 3 ? 'fill-analysis/25 stroke-analysis' : 'fill-accent/10 stroke-accent') : 'fill-transparent stroke-border'} />
        ))}
        {rings.map((rg) => {
          const def = K.SELF_LEVELS.find((x) => x.id === rg.id)!;
          return (
            <text key={`t${rg.id}`} x={150} y={rg.id === 'hidden' ? 154 : 150 - rg.r + 19} textAnchor="middle" fontSize={10} className={isFilled(sv[rg.id]) ? 'fill-text font-medium' : 'fill-muted'}>
              {def.short || def.label}
            </text>
          );
        })}
      </Svg>
      <div className="mt-2 grid gap-1.5">
        {K.SELF_LEVELS.map((s) => (
          <div key={s.id} className={cn('rounded border px-2 py-1', isFilled(sv[s.id]) ? 'border-border' : 'border-dashed border-border opacity-60')}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <b>{s.label}</b>
              <span className="text-muted">{s.madMen}</span>
            </div>
            <p className="font-text text-xs text-muted">{trunc(sv[s.id], compact ? 120 : 200) || '—'}</p>
          </div>
        ))}
      </div>
    </VizCard>
  );
}

/* ------------------------------------------------------------------ */
/* 07 · Motivazione e desiderio                                        */
/* ------------------------------------------------------------------ */

export function MotivationLadder({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const mot = c.inner.motivations;
  const top = [...K.MOTIVATIONS]
    .filter((m) => Number(mot[m.id]) > 0)
    .sort((a, b) => mot[b.id] - mot[a.id])
    .slice(0, 3)
    .map((m) => m.id);
  const top2 = [...K.MOTIVATIONS]
    .filter((m) => Number(mot[m.id]) > 0)
    .sort((a, b) => mot[b.id] - mot[a.id])
    .slice(0, 2)
    .map((m) => m.label);
  const charge = c.inner.incitingCharge;
  const steps = [
    { k: t('Motivation'), v: top2.join(' + ') },
    { k: `${t('Inciting incident')} ${charge === 'positive' ? '(+)' : charge === 'negative' ? '(−)' : ''}`, v: c.inner.incitingIncident },
    { k: t('Super-objective'), v: c.inner.superObjective },
    { k: t('Object of desire'), v: c.inner.objectOfDesire },
    { k: t('Counterdesire'), v: c.complexity.subconsciousDesire },
  ];
  return (
    <>
      <VizCard title={t('Ladder of motivation')} sub={t('Ch. {n}', { n: 8 })}>
        <p className="text-[10px] text-muted">{t('↑ elevated')}</p>
        <div className="my-1 flex flex-col gap-0.5">
          {[...K.MOTIVATIONS].reverse().map((m) => {
            const v = num(mot[m.id]);
            return (
              <div key={m.id} title={m.desc} className={cn('flex items-center gap-2 text-[11px]', top.includes(m.id) ? 'text-text' : 'text-muted')}>
                <span className="w-4 text-right font-mono">{K.MOTIVATIONS.indexOf(m) + 1}</span>
                <span className="w-24 truncate">{m.label}</span>
                <span className="h-1.5 flex-1 rounded-full bg-panel-2">
                  <span className={cn('block h-full rounded-full', top.includes(m.id) ? 'bg-accent' : 'bg-muted/50')} style={{ width: `${v * 10}%` }} />
                </span>
                <span className="w-4 font-mono">{v || ''}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted">{t('primal ↓')}</p>
      </VizCard>
      <VizCard title={t('From push to pull')}>
        <ol className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <li key={i} className={cn('rounded border-l-2 px-2 py-1 text-xs', isFilled(s.v) ? (i === 4 ? 'border-analysis' : 'border-accent') : 'border-border opacity-60')}>
              <b className="block text-[11px]">{s.k}</b>
              <span className="font-text text-muted">{trunc(s.v, 130) || '—'}</span>
            </li>
          ))}
        </ol>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 08 · Scelta                                                         */
/* ------------------------------------------------------------------ */

export function ChoiceDepthViz({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const d = choiceDepth(c);
  const cx = 150;
  const cy = 130;
  const R = 100;
  const v = d == null ? 0 : d / 10;
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(cx, cy, R, 180 + from * 180);
    const [x2, y2] = polar(cx, cy, R, 180 + to * 180);
    return `M ${f1(x1)} ${f1(y1)} A ${R} ${R} 0 0 1 ${f1(x2)} ${f1(y2)}`;
  };
  const [nx, ny] = polar(cx, cy, R - 18, 180 + v * 180);
  const dl = c.inner.dilemma;
  const kind = K.DILEMMA_KINDS.find((x) => x.id === dl.kind);
  const em = c.inner.emotions;
  return (
    <>
      <VizCard title={t('Depth of choice')} sub={t('Ch. {n}', { n: 8 })}>
        <Svg w={300} h={175} label={t('Choice depth gauge')}>
          <path d={arc(0, 1)} className="fill-none stroke-border" strokeWidth={14} strokeLinecap="round" />
          {d != null && <path d={arc(0, Math.max(v, 0.01))} className="fill-none stroke-accent" strokeWidth={14} strokeLinecap="round" />}
          <line x1={cx} y1={cy} x2={f1(nx)} y2={f1(ny)} className="stroke-text" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={6} className="fill-text" />
          <text x={cx} y={cy + 30} textAnchor="middle" fontSize={20} className="fill-text font-semibold">
            {d ?? '—'}
          </text>
          <text x={cx - R} y={cy + 16} textAnchor="middle" fontSize={9} className="fill-muted">
            {t('trivial')}
          </text>
          <text x={cx + R} y={cy + 16} textAnchor="middle" fontSize={9} className="fill-muted">
            {t('profound')}
          </text>
        </Svg>
        <Note>{t('Risk {risk}/10 × freedom {freedom}/10. Greater risk, deeper choice; freer choice, deeper still.', { risk: fin(c.inner.pressure.risk) ? c.inner.pressure.risk : '—', freedom: fin(c.inner.pressure.freedom) ? c.inner.pressure.freedom : '—' })}</Note>
      </VizCard>
      <VizCard title={kind ? kind.label : t('The dilemma')}>
        {dl.optionA || dl.optionB ? (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="rounded border border-border p-2 text-xs">
                <b>A</b> <span className="font-text">{trunc(dl.optionA, 110) || '—'}</span>
              </div>
              <span className="font-mono text-xs text-muted">{kind ? (kind.id === 'positive' ? '+ / +' : '− / −') : '?'}</span>
              <div className="rounded border border-border p-2 text-xs">
                <b>B</b> <span className="font-text">{trunc(dl.optionB, 110) || '—'}</span>
              </div>
            </div>
            {dl.choice && (
              <p className="mt-2 text-xs">
                <b>{t('She chooses')}</b> {trunc(dl.choice, 160)}
              </p>
            )}
          </>
        ) : (
          <Empty>{t('Set two near-equal options to test her.')}</Empty>
        )}
      </VizCard>
      {K.EMOTION_PAIRS.some((p) => fin(em[p.id])) && (
        <VizCard title={t('Emotional palette')}>
          <Diverging rows={K.EMOTION_PAIRS.map((p) => ({ left: p.left, right: p.right, value: em[p.id] }))} />
        </VizCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 09 · Dimensioni                                                     */
/* ------------------------------------------------------------------ */

export function DimensionWheel({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, tn } = ctx.M;
  const dims = c.dimensions.filter((d) => d.positive || d.negative);
  const def = definingDimension(c);
  const cx = 170;
  const cy = 170;
  const R = 112;
  const others = dims.filter((d) => d !== def);
  return (
    <VizCard title={t('Dimension wheel')} sub={`${tn(dims.length, '{n} dimension', '{n} dimensions')} · ${t('Ch. {n}', { n: 9 })}`}>
      <Svg w={340} h={340} label={t('Dimension wheel')}>
        <circle cx={cx} cy={cy} r={R + 34} className="fill-none stroke-border" strokeDasharray="2 4" />
        {others.map((d, i) => {
          const a = (360 / Math.max(others.length, 1)) * i - 90;
          const [x1, y1] = polar(cx, cy, 46, a);
          const [xm, ym] = polar(cx, cy, 46 + (R - 46) / 2, a);
          const [x2, y2] = polar(cx, cy, R, a);
          const [lx, ly0] = polar(cx, cy, R + 12, a);
          // Le etichette dei raggi rivolti verso il basso scendono sotto l'estremità.
          const ly = Math.sin(deg(a)) > 0.5 ? ly0 + 10 : Math.sin(deg(a)) < -0.5 ? ly0 - 4 : ly0;
          const anchor = anchorOf(lx, cx, 10);
          return (
            <g key={d.id}>
              <line x1={f1(x1)} y1={f1(y1)} x2={f1(xm)} y2={f1(ym)} className="stroke-ok" strokeWidth={3} />
              <line x1={f1(xm)} y1={f1(ym)} x2={f1(x2)} y2={f1(y2)} className="stroke-danger" strokeWidth={3} />
              <circle cx={f1(x2)} cy={f1(y2)} r={5} className="fill-panel stroke-muted" />
              <text x={f1(lx)} y={f1(ly - 5)} textAnchor={anchor} fontSize={10} className="fill-ok">
                {trunc(d.positive, 16)}
              </text>
              <text x={f1(lx)} y={f1(ly + 8)} textAnchor={anchor} fontSize={10} className="fill-danger">
                {trunc(d.negative, 16)}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={46} className={def ? 'fill-accent/15 stroke-accent' : 'fill-panel-2 stroke-border'} strokeWidth={2} />
        {def ? (
          <>
            <text x={cx} y={cy - 7} textAnchor="middle" fontSize={11} className="fill-ok font-semibold">
              {trunc(def.positive, 13)}
            </text>
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} className="fill-muted">
              /
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} className="fill-danger font-semibold">
              {trunc(def.negative, 13)}
            </text>
          </>
        ) : (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} className="fill-muted">
            {dims.length ? t('choose a defining') : t('no dimensions')}
          </text>
        )}
      </Svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="text-ok">■ {t('positive pole')}</span>
        <span className="text-danger">■ {t('negative pole')}</span>
        <span className="text-accent">● {t('defining dimension (the axle)')}</span>
      </div>
    </VizCard>
  );
}

/* ------------------------------------------------------------------ */
/* 10 · Antagonismo                                                    */
/* ------------------------------------------------------------------ */

export function UnderdogScale({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const ap = antagonismProfile(c);
  const cap = ap.capacity;
  const diff = cap == null ? 0 : ap.power - cap;
  const tilt = Math.max(-16, Math.min(16, diff * 3));
  const cx = 160;
  const cy = 70;
  const L = 110;
  const lx = cx - L * Math.cos(deg(tilt));
  const ly = cy - L * Math.sin(deg(tilt));
  const rx = cx + L * Math.cos(deg(tilt));
  const ry = cy + L * Math.sin(deg(tilt));
  const pan = (x: number, y: number, label: string, value: number | null, cls: string) => (
    <g>
      <line x1={f1(x)} y1={f1(y)} x2={f1(x - 30)} y2={f1(y + 46)} className="stroke-muted" />
      <line x1={f1(x)} y1={f1(y)} x2={f1(x + 30)} y2={f1(y + 46)} className="stroke-muted" />
      <path d={`M ${f1(x - 38)} ${f1(y + 46)} Q ${f1(x)} ${f1(y + 70)} ${f1(x + 38)} ${f1(y + 46)} Z`} className={cls} />
      <text x={f1(x)} y={f1(y + 58)} textAnchor="middle" fontSize={12} className="fill-text font-semibold">
        {value ?? '—'}
      </text>
      <text x={f1(x)} y={f1(y + 90)} textAnchor="middle" fontSize={10} className="fill-muted">
        {label}
      </text>
    </g>
  );
  const verdict =
    cap == null
      ? t('Rate her capacity to weigh her against the world.')
      : ap.underdog
        ? t('Underdog: the forces of antagonism outweigh her — she has a chance, just a chance.')
        : t('Not yet an underdog: the world should virtually overwhelm her.');
  const depth = new Set(c.complexity.depthTraits);
  return (
    <>
      <VizCard title={t('The underdog scale')} sub={t('Ch. {n}', { n: '6, 10' })}>
        <Svg w={320} h={250} label={t('Underdog balance')}>
          <polygon points={`${cx - 14},${cy + 150} ${cx + 14},${cy + 150} ${cx},${cy}`} className="fill-panel-2 stroke-border" />
          <line x1={f1(lx)} y1={f1(ly)} x2={f1(rx)} y2={f1(ry)} className="stroke-text" strokeWidth={3} strokeLinecap="round" />
          {pan(lx, ly, t('Her capacities'), cap, 'fill-accent/30 stroke-accent')}
          {pan(rx, ry, t('Antagonism'), ap.power || 0, 'fill-danger/25 stroke-danger')}
          <circle cx={cx} cy={cy} r={5} className="fill-text" />
        </Svg>
        <Note good={!!ap.underdog}>{verdict}</Note>
      </VizCard>
      <VizCard title={t('Forces of antagonism by level')} sub={t('{n}/4 levels', { n: ap.levelsEngaged })}>
        <div className="flex flex-col gap-1.5">
          {K.CONFLICT_LEVELS.map((lv) => {
            const fs = ap.forces.filter((f) => f.level === lv.id);
            const sum = fs.reduce((s, f) => s + f.value, 0);
            return (
              <div key={lv.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-muted">{lv.label}</span>
                <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                  {fs.map((f) => (
                    <span key={f.id} title={`${K.ANTAGONISM_FORCES.find((x) => x.id === f.id)?.label}: ${f.value}`} className="h-full border-r border-panel bg-danger/70" style={{ width: `${(f.value / (fs.length * 10)) * 100}%` }} />
                  ))}
                </span>
                <span className="w-5 text-right font-mono text-muted">{sum}</span>
              </div>
            );
          })}
        </div>
      </VizCard>
      <VizCard title={t('Depth of character')} sub={t('{n}/10 depth traits', { n: depth.size })}>
        <div className="flex flex-wrap gap-1.5">
          {K.DEPTH_TRAITS.map((dt) => (
            <span key={dt.id} title={dt.label} className={cn('size-3.5 rounded-full border', depth.has(dt.id) ? 'border-accent bg-accent' : 'border-border')} />
          ))}
        </div>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 11 · Arco (punti trascinabili)                                      */
/* ------------------------------------------------------------------ */

export function ArcChart({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const tps = c.arc.turningPoints;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const w = 340;
  const h = 230;
  const pad = { l: 26, r: 14, t: 18, b: 34 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const y = (v: number) => pad.t + ih / 2 - (v / 5) * (ih / 2);
  const x = (i: number) => pad.l + (tps.length <= 1 ? iw / 2 : (iw * i) / (tps.length - 1));
  const interactive = !!ctx.onTurningPoint;
  const chargeAt = (clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sy = ((clientY - rect.top) / rect.height) * h;
    return Math.max(-5, Math.min(5, Math.round(((pad.t + ih / 2 - sy) / (ih / 2)) * 5)));
  };
  const pts = tps.map((tp, i) => [x(i), y(num(Number(tp.charge)))] as const);
  const type = K.ARC_TYPES.find((a) => a.id === c.arc.type);
  const dim = c.dimensions.find((d) => d.id === c.arc.dimensionId);
  const steps: [string, unknown][] = [
    [t('Preparation'), c.arc.need],
    [t('Revelation'), c.arc.isAtClimax || c.arc.seemsAtStart],
    [t('Change'), c.arc.type && c.arc.type !== 'revealed' ? `${c.arc.from || ''} → ${c.arc.to || ''}` : c.arc.type === 'revealed' ? K.ARC_TYPES.find((a) => a.id === 'revealed')!.label : ''],
    [t('Completion'), c.arc.completion || c.arc.climax],
  ];
  return (
    <>
      <VizCard title={t('Arc of turning points')} sub={t('Ch. {n}', { n: 11 })}>
        {type && (
          <p className="mb-1 text-xs">
            <b>{type.label}</b>
            {(c.arc.from || c.arc.to) && (
              <span className="text-muted">
                {' '}
                {c.arc.from || '?'} → {c.arc.to || '?'}
              </span>
            )}
            {dim && <em className="ml-1 text-muted">{t('along {pos} / {neg}', { pos: dim.positive, neg: dim.negative })}</em>}
          </p>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={t('Arc chart')}
          className="mx-auto block h-auto w-full max-w-[22rem] touch-none select-none"
          onPointerMove={(e) => {
            if (drag != null && ctx.onTurningPoint) ctx.onTurningPoint(drag, chargeAt(e.clientY));
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <rect x={pad.l} y={pad.t} width={iw} height={ih / 2} className="fill-ok/5" />
          <rect x={pad.l} y={pad.t + ih / 2} width={iw} height={ih / 2} className="fill-danger/5" />
          <line x1={pad.l} x2={pad.l + iw} y1={y(0)} y2={y(0)} className="stroke-border" />
          <text x={pad.l - 6} y={y(5) + 4} textAnchor="end" fontSize={12} className="fill-ok">
            +
          </text>
          <text x={pad.l - 6} y={y(-5) + 4} textAnchor="end" fontSize={12} className="fill-danger">
            −
          </text>
          {tps.length ? (
            <>
              <path d={`M ${pts.map((p) => p.map(f1).join(' ')).join(' L ')}`} className="fill-none stroke-accent" strokeWidth={2} />
              {tps.map((tp, i) => {
                const [px, py] = pts[i];
                const v = num(Number(tp.charge));
                return (
                  <g key={tp.id} className={interactive ? 'cursor-ns-resize' : undefined}>
                    <circle
                      cx={f1(px)}
                      cy={f1(py)}
                      r={interactive ? 9 : 6}
                      className={cn(v > 0 ? 'fill-ok' : v < 0 ? 'fill-danger' : 'fill-muted', 'stroke-panel')}
                      strokeWidth={2}
                      tabIndex={interactive ? 0 : undefined}
                      role={interactive ? 'slider' : undefined}
                      aria-label={tp.label || `${i + 1}`}
                      aria-valuemin={-5}
                      aria-valuemax={5}
                      aria-valuenow={v}
                      onPointerDown={(e) => {
                        if (!interactive) return;
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                        setDrag(i);
                      }}
                      onKeyDown={(e) => {
                        if (!ctx.onTurningPoint) return;
                        if (e.key === 'ArrowUp') ctx.onTurningPoint(i, Math.min(5, v + 1));
                        if (e.key === 'ArrowDown') ctx.onTurningPoint(i, Math.max(-5, v - 1));
                      }}
                    >
                      <title>
                        {tp.label} ({v > 0 ? '+' : ''}
                        {v})
                      </title>
                    </circle>
                    <text x={f1(px)} y={f1(py + (v >= 0 ? -14 : 22))} textAnchor="middle" fontSize={10} className="pointer-events-none fill-muted">
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </>
          ) : (
            <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} className="fill-muted">
              {t('Add turning points to draw the arc')}
            </text>
          )}
          <text x={pad.l} y={h - 10} fontSize={9} className="fill-muted">
            {t('inciting incident')}
          </text>
          <text x={pad.l + iw} y={h - 10} textAnchor="end" fontSize={9} className="fill-muted">
            {t('climax')}
          </text>
        </svg>
        {interactive && tps.length > 0 && <Note>{t('Drag a point up or down to change its charge.')}</Note>}
        {tps.length > 0 && (
          <ol className="mt-2 flex flex-col gap-0.5 text-xs">
            {tps.map((tp, i) => {
              const v = num(Number(tp.charge));
              return (
                <li key={tp.id} className="flex gap-2">
                  <span className={cn('w-6 font-mono', v > 0 ? 'text-ok' : v < 0 ? 'text-danger' : 'text-muted')}>
                    {v > 0 ? '+' : ''}
                    {v}
                  </span>
                  <span className="text-muted">
                    {i + 1}. {trunc(tp.label, 60)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </VizCard>
      <VizCard title={t('Four steps of character design')}>
        <div className="grid grid-cols-2 gap-1.5">
          {steps.map(([k, v], i) => (
            <div key={i} className={cn('rounded border px-2 py-1', isFilled(v) ? 'border-accent/40' : 'border-dashed border-border opacity-60')}>
              <b className="text-[11px]">
                {i + 1}. {k}
              </b>
              <p className="font-text text-xs text-muted">{trunc(v, 90) || '—'}</p>
            </div>
          ))}
        </div>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 12 · Simbolo                                                        */
/* ------------------------------------------------------------------ */

function SymbolicSpectrum({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const sym = c.symbolic;
  const levels = ['archetype', 'allegory', 'type', 'stock'];
  const sp = sym.spectrum;
  const arche = sym.archetypes.map((id) => K.ARCHETYPES.find((a) => a.id === id)?.label).filter(Boolean);
  return (
    <>
      <VizCard title={t('From brightest to dimmest')} sub={t('Ch. {n}', { n: 12 })}>
        <div className="flex flex-col gap-1">
          {levels.map((l, i) => {
            const o = K.SYMBOLIC_LEVELS.find((x) => x.id === l)!;
            return (
              <div key={l} title={o.desc} className={cn('rounded border px-2 py-1 text-xs', sym.level === l ? 'border-accent bg-accent-soft' : 'border-border')} style={{ opacity: sym.level === l ? 1 : 1 - i * 0.15 }}>
                <b className={sym.level === l ? 'text-accent' : undefined}>{o.label}</b> <span className="text-muted">{o.desc.split('.')[0]}</span>
              </div>
            );
          })}
        </div>
        {sym.level === 'none' && <Note>{t('Realistic: personification outweighs symbol.')}</Note>}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <span>{t('Realism')}</span>
          <span className="relative h-1.5 flex-1 rounded-full bg-panel-2">
            <span className={cn('absolute -top-1 size-3.5 -translate-x-1/2 rounded-full bg-accent', !fin(sp) && 'opacity-30')} style={{ left: `${fin(sp) ? sp * 10 : 50}%` }} />
          </span>
          <span>{t('Symbolism')}</span>
        </div>
        {arche.length > 0 && (
          <Note>
            {t('Archetypal chords:')} <b className="text-text">{arche.join(', ')}</b>
          </Note>
        )}
        {sym.veil && <p className="mt-2 font-text text-xs italic">{trunc(sym.veil, 160)}</p>}
      </VizCard>
      <VizCard title={t('Character × world')} sub={t('Ch. {n}', { n: 13 })}>
        <div className="grid grid-cols-2 gap-1.5">
          {K.REALITY_MODES.map((m) => (
            <div key={m.id} className={cn('rounded border px-2 py-1.5', sym.mode === m.id ? 'border-accent bg-accent-soft' : 'border-border')}>
              <b className={cn('text-xs', sym.mode === m.id && 'text-accent')}>{m.label}</b>
              <p className="text-[10px] leading-snug text-muted">
                {m.char === 'conventional' ? t('conventional character') : t('unconventional character')} · {m.world === 'conventional' ? t('conventional world') : t('unconventional world')}
              </p>
            </div>
          ))}
        </div>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 13 · Genere                                                         */
/* ------------------------------------------------------------------ */

export function GenreSheets({ ctx, coreCastRole, cast }: { ctx: VizCtx; coreCastRole?: string; cast?: { name: string; role: string }[] }) {
  const { t, K } = ctx.M;
  const genres = (ctx.story?.genre.primary ?? []).map((id) => K.PRIMARY_GENRES.find((g) => g.id === id)).filter((g) => !!g);
  if (!genres.length) {
    return (
      <VizCard title={t('Story genre')} sub={t('Ch. {n}', { n: 14 })}>
        <Empty>{t('Choose the story’s primary genre(s) in story settings.')}</Empty>
      </VizCard>
    );
  }
  return (
    <>
      {genres.map((g) => {
        const [pos, neg] = g.coreValue.split(/ vs\. | contro | ↔ /);
        return (
          <VizCard key={g.id} title={g.label} sub={g.family === 'fortune' ? t('Plot of Fortune') : t('Plot of Character · {quality}', { quality: g.quality })}>
            <p className="text-center text-sm">
              <span className="text-ok">{pos ?? g.coreValue}</span>
              {neg && (
                <>
                  <span className="mx-1.5 text-xs text-muted">{t('vs.')}</span>
                  <span className="text-danger">{neg}</span>
                </>
              )}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">{t('Core event')}</dt>
              <dd>{g.coreEvent}</dd>
              <dt className="text-muted">{t('Core emotion')}</dt>
              <dd>{g.coreEmotion}</dd>
              <dt className="text-muted">{t('Core cast')}</dt>
              <dd className="flex flex-wrap gap-1">
                {g.coreCast.map((r) => {
                  const who = cast?.filter((m) => m.role === r).map((m) => m.name) ?? [];
                  const on = coreCastRole === r || who.length > 0;
                  return (
                    <span key={r} className={cn('rounded border px-1.5 py-px text-[11px]', on ? 'border-accent/50 bg-accent-soft text-accent' : 'border-border text-muted')}>
                      {t(r)}
                      {who.length ? `: ${who.join(', ')}` : ''}
                    </span>
                  );
                })}
              </dd>
            </dl>
          </VizCard>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 14 · Azione                                                         */
/* ------------------------------------------------------------------ */

function SceneBeats({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const scenes = c.action.scenes;
  const mo = K.MO_THEMES.find((m) => m.id === c.action.mo.theme);
  const moGroups: Record<string, string> = { Hollywood: t('Hollywood MO'), Political: t('Political MO'), Object: t('Object MO') };
  const w = 300;
  const rowH = 40;
  const sx = (v: unknown) => 40 + ((num(v) + 5) / 10) * (w - 80);
  const self = c.action.selfStory as unknown as Record<string, string>;
  return (
    <>
      <VizCard title={t('Self-story')} sub={t('Ch. {n}', { n: 15 })}>
        <div className="grid grid-cols-3 gap-1.5">
          {(['past', 'present', 'future'] as const).map((k) => (
            <div key={k} className={cn('rounded border px-2 py-1', isFilled(self[k]) ? 'border-accent/40' : 'border-dashed border-border opacity-60')}>
              <b className="text-[11px]">{t(k)}</b>
              <p className="font-text text-[11px] text-muted">{trunc(self[k], 100) || '—'}</p>
            </div>
          ))}
        </div>
      </VizCard>
      {mo && (
        <VizCard title={mo.label} sub={moGroups[mo.group!] ?? mo.group}>
          <p className="text-xs text-muted">{mo.desc}</p>
          <p className="mt-2 font-text text-xs italic">
            <b className="not-italic">{t('Twist:')}</b> {c.action.mo.twist || mo.twist}
          </p>
        </VizCard>
      )}
      <VizCard title={t('Value change per scene')}>
        {scenes.length ? (
          <>
            <Svg w={w} h={scenes.length * rowH + 8} label={t('Scene value changes')}>
              <defs>
                {(['ok', 'danger', 'warn'] as const).map((k) => (
                  <marker key={k} id={`mk-${k}`} viewBox="0 0 10 10" refX={7} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" className={TONE_FILL[k]} />
                  </marker>
                ))}
              </defs>
              <line x1={sx(0)} x2={sx(0)} y1={4} y2={Math.max(1, scenes.length) * rowH} className="stroke-border" strokeDasharray="2 3" />
              {scenes.map((s, i) => {
                const yy = i * rowH + 26;
                const has = fin(s.from) && fin(s.to);
                const dir = has ? (s.to! > s.from! ? 'ok' : s.to! < s.from! ? 'danger' : 'warn') : 'warn';
                return (
                  <g key={s.id}>
                    <text x={4} y={yy - 12} fontSize={10} className="fill-text">
                      {trunc(`${i + 1}. ${s.title || t('Scene')}${s.value ? ` — ${s.value}` : ''}`, 44)}
                    </text>
                    <line x1={sx(-5)} x2={sx(5)} y1={yy} y2={yy} className="stroke-border" />
                    {has && (
                      <>
                        <line x1={f1(sx(s.from))} x2={f1(sx(s.to))} y1={yy} y2={yy} className={TONE_STROKE[dir]} strokeWidth={3} markerEnd={`url(#mk-${dir})`} />
                        <circle cx={f1(sx(s.from))} cy={yy} r={4} className="fill-muted" />
                      </>
                    )}
                  </g>
                );
              })}
            </Svg>
            <div className="flex justify-between text-[11px] text-muted">
              <span>{t('− negative')}</span>
              <span>{t('positive +')}</span>
            </div>
          </>
        ) : (
          <Empty>{t('Add a scene to see its value turn.')}</Empty>
        )}
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 15 · Performance                                                    */
/* ------------------------------------------------------------------ */

export function PerformanceStar({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const on = new Set(c.performance.functions);
  const cx = 150;
  const cy = 140;
  const n = K.PERFORMANCE_FUNCTIONS.length;
  const pts: [number, number][] = [];
  K.PERFORMANCE_FUNCTIONS.forEach((f, i) => {
    const a = -90 + (360 / n) * i;
    pts.push(polar(cx, cy, on.has(f.id) ? 100 : 40, a));
    pts.push(polar(cx, cy, 26, a + 180 / n));
  });
  const sc = suspenseScore(c);
  return (
    <>
      <VizCard title={t('Seven functions in performance')} sub={`${on.size}/7 · ${t('Ch. {n}', { n: 16 })}`}>
        <Svg w={300} h={280} label={t('Performance functions')}>
          <circle cx={cx} cy={cy} r={102} className="fill-none stroke-border" strokeDasharray="2 4" />
          <polygon points={pts.map((p) => p.map(f1).join(',')).join(' ')} className="fill-accent/20 stroke-accent" strokeWidth={1.5} />
          {K.PERFORMANCE_FUNCTIONS.map((f, i) => {
            const [lx, ly] = polar(cx, cy, 116, -90 + (360 / n) * i);
            return (
              <text key={f.id} x={f1(lx)} y={f1(ly)} textAnchor={anchorOf(lx, cx, 10)} dominantBaseline="middle" fontSize={10} className={on.has(f.id) ? 'fill-accent font-medium' : 'fill-muted'}>
                {f.short || f.label}
              </text>
            );
          })}
        </Svg>
      </VizCard>
      <VizCard title={t('Suspense')}>
        <div className="flex flex-col gap-1.5">
          <HBar label={t('Curiosity')} value={c.performance.curiosity} />
          <HBar label={t('Concern')} value={c.performance.concern} alt />
        </div>
        <Note>
          {t('Suspense = curiosity × concern')}
          {sc != null && <b className="text-text"> → {sc}/10</b>}
        </Note>
      </VizCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 16 · Relazioni                                                      */
/* ------------------------------------------------------------------ */

export function RelationshipWeb({ c, ctx }: { c: McKeeCharacter; ctx: VizCtx }) {
  const { t, K } = ctx.M;
  const byId = new Map(ctx.cast.map((m) => [m.id, m]));
  const links = new Map<string, { out?: (typeof c.relationships)[number]; in?: (typeof c.relationships)[number] }>();
  for (const r of c.relationships) if (r.targetId && byId.has(r.targetId)) links.set(r.targetId, { out: r });
  for (const m of ctx.cast) for (const r of m.build.relationships) if (r.targetId === c.id) links.set(m.id, { ...(links.get(m.id) ?? {}), in: r });
  const ids = [...links.keys()];
  const cx = 160;
  const cy = 150;
  const effCls = (eff: string) => (eff === 'helps' ? 'stroke-ok' : eff === 'hinders' ? 'stroke-danger' : eff === 'both' ? 'stroke-warn' : 'stroke-muted');
  const who = (dimId: string) => {
    const out: string[] = [];
    for (const r of c.relationships) if (r.dimensionId === dimId && r.targetId && byId.has(r.targetId)) out.push(byId.get(r.targetId)!.name);
    for (const m of ctx.cast) for (const r of m.build.relationships) if (r.targetId === c.id && r.dimensionId === dimId) out.push(m.name);
    return [...new Set(out)];
  };
  return (
    <>
      <VizCard title={t('Relationship web')} sub={t('Ch. {n}', { n: 17 })}>
        {ids.length ? (
          <>
            <Svg w={320} h={310} label={t('Relationship web')}>
              {ids.map((id, i) => {
                const a = (360 / Math.max(ids.length, 1)) * i - 90;
                const [x, y] = polar(cx, cy, 112, a);
                const l = links.get(id)!;
                const eff = l.out?.effect || l.in?.effect || '';
                const [mx, my] = polar(cx, cy, 58, a);
                const kind = K.RELATIONSHIP_KINDS.find((k) => k.id === (l.out?.kind || l.in?.kind))?.label ?? '';
                return (
                  <g key={`e${id}`}>
                    <line x1={cx} y1={cy} x2={f1(x)} y2={f1(y)} className={effCls(eff)} strokeWidth={l.out && l.in ? 3 : 1.5} />
                    {kind && (
                      <text x={f1(mx)} y={f1(my)} textAnchor="middle" fontSize={9} className="fill-muted">
                        {kind}
                      </text>
                    )}
                  </g>
                );
              })}
              {ids.map((id, i) => {
                const m = byId.get(id)!;
                const a = (360 / Math.max(ids.length, 1)) * i - 90;
                const [x, y] = polar(cx, cy, 112, a);
                const [tx, ty] = polar(cx, cy, 138, a);
                const anchor = anchorOf(tx, cx, 12);
                return (
                  <g key={id} className={ctx.onOpenCharacter ? 'cursor-pointer' : undefined} onClick={() => ctx.onOpenCharacter?.(id)}>
                    <circle cx={f1(x)} cy={f1(y)} r={17} className="fill-panel-2 stroke-muted" />
                    <text x={f1(x)} y={f1(y + 4)} textAnchor="middle" fontSize={10} className="fill-text font-semibold">
                      {initials(m.name)}
                    </text>
                    <text x={f1(anchor === 'middle' ? tx : tx + (tx > cx ? -8 : 8))} y={f1(ty + (anchor === 'middle' ? (ty < cy ? -2 : 8) : 4))} textAnchor={anchor} fontSize={10} className="fill-text">
                      {trunc(m.name, 18)}
                    </text>
                  </g>
                );
              })}
              <circle cx={cx} cy={cy} r={26} className="fill-accent" />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} className="fill-accent-fg font-semibold">
                {initials(c.name)}
              </text>
            </Svg>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <span className="text-ok">— {t('helps')}</span>
              <span className="text-danger">— {t('hinders')}</span>
              <span className="text-warn">— {t('both')}</span>
            </div>
          </>
        ) : (
          <Empty>{t('Link her to other cast members.')}</Empty>
        )}
      </VizCard>
      {c.dimensions.length > 0 && (
        <VizCard title={t('Who draws out each dimension?')}>
          <ul className="flex flex-col gap-1 text-xs">
            {c.dimensions.map((d) => {
              const names = who(d.id);
              return (
                <li key={d.id} className={names.length ? undefined : 'text-muted'}>
                  <b>
                    {d.positive || '?'} / {d.negative || '?'}
                  </b>{' '}
                  {names.length ? `← ${names.join(', ')}` : <i>{t('dormant')}</i>}
                </li>
              );
            })}
          </ul>
        </VizCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Registro                                                            */
/* ------------------------------------------------------------------ */

const VISUALS: Record<string, (p: { c: McKeeCharacter; ctx: VizCtx }) => ReactNode> = {
  sparkSpheres: SparkSpheres,
  castOrbit: CastOrbit,
  traitDensity: TraitCanvas,
  bigFive: BigFiveRadar,
  settingRings: SettingRings,
  fourSelves: FourSelves,
  motivationLadder: MotivationLadder,
  choiceDepth: ChoiceDepthViz,
  dimensionWheel: DimensionWheel,
  underdogScale: UnderdogScale,
  arcChart: ArcChart,
  symbolicSpectrum: SymbolicSpectrum,
  genreCard: ({ c, ctx }) => <GenreSheets ctx={ctx} coreCastRole={c.genre.coreCastRole} />,
  sceneBeats: SceneBeats,
  performanceStar: PerformanceStar,
  relationshipWeb: RelationshipWeb,
};

export function StationVisual({ visual, c, ctx }: { visual: string; c: McKeeCharacter; ctx: VizCtx }) {
  const V = VISUALS[visual];
  return V ? <>{V({ c, ctx })}</> : null;
}

/** Barre di completamento delle sedici stazioni (profilo). */
export function StationBars({ c, ctx, onOpen }: { c: McKeeCharacter; ctx: VizCtx; onOpen(id: string): void }) {
  const p = overallProgress(c, ctx.story);
  return (
    <div className="flex items-end gap-1">
      {ctx.M.SECTIONS.map((s) => {
        const b = p.bySection[s.id];
        return (
          <button key={s.id} type="button" title={`${s.title} — ${b.filled}/${b.total}`} onClick={() => onOpen(s.id)} className={cn('flex flex-1 flex-col items-center gap-1', !b.expected && 'opacity-50')}>
            <span className="relative h-16 w-full overflow-hidden rounded bg-panel-2">
              <span className="absolute inset-x-0 bottom-0 bg-accent" style={{ height: `${Math.round(b.ratio * 100)}%` }} />
            </span>
            <span className="font-mono text-[10px] text-muted">{s.num}</span>
          </button>
        );
      })}
    </div>
  );
}
