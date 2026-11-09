/**
 * Campi delle stazioni McKee (da CharBuild), nello stile di PERSONA.
 * Ogni campo è legato per percorso alla costruzione; `edit` applica una modifica a una copia.
 */
import type { CastMember } from '@persona/shared/client';
import {
  getPath,
  setPath,
  uid,
  type CharacterBuild,
  type FieldDef,
  type McKeeData,
  type StoryDesign,
} from '@persona/shared/mckee';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Plus, Star, Trash2, X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Button, cx, IconButton, Input, Select, Textarea } from '../ui';
import { fin } from '../../lib/mckee';

/** Muta una copia della costruzione (o dell'impianto della storia). */
export type Edit<T> = (fn: (draft: T) => void) => void;

export interface FieldCtx {
  M: McKeeData;
  story: StoryDesign | null;
  cast: CastMember[];
  /** Apre l'impianto narrativo della storia di riferimento. */
  storyLink?: ReactNode;
}

const listOf = <T,>(obj: unknown, path: string): T[] => {
  const v = getPath(obj, path);
  return Array.isArray(v) ? (v as T[]) : [];
};

export function fieldVisible(f: Pick<FieldDef, 'showIf'>, b: CharacterBuild, story: StoryDesign | null) {
  return !f.showIf || f.showIf(b, story);
}

function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
      {children}
    </label>
  ) : (
    <span className="text-xs font-medium text-muted">{children}</span>
  );
}

function Help({ children }: { children?: ReactNode }) {
  return children ? <p className="text-xs text-muted/80">{children}</p> : null;
}

/* ------------------------------------------------------------------ */
/* Controlli di base                                                   */
/* ------------------------------------------------------------------ */

export function Chips({
  options,
  value,
  onToggle,
  small,
}: {
  options: { id: string; label: string; desc?: string }[];
  value: string[];
  onToggle(id: string): void;
  small?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            title={o.desc || undefined}
            onClick={() => onToggle(o.id)}
            className={cx(
              'inline-flex items-center gap-1 rounded-full border px-2.5',
              small ? 'py-0 text-[11px]' : 'py-0.5 text-xs',
              on ? 'border-accent/50 bg-accent-soft text-accent' : 'border-border text-muted hover:border-muted hover:text-text',
            )}
          >
            {on && <Check className="size-3" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function OptionCards({
  options,
  value,
  onChange,
  columns = 2,
  label,
}: {
  options: { id: string; label: string; desc?: string; extra?: ReactNode }[];
  value: string;
  onChange(id: string): void;
  columns?: 2 | 3;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('grid gap-1.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? '' : o.id)}
            className={cx(
              'flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left',
              on ? 'border-accent/60 bg-accent-soft' : 'border-border hover:border-muted',
            )}
          >
            <span className={cx('text-sm font-medium', on && 'text-accent')}>{o.label}</span>
            {o.desc && <span className="text-xs leading-snug text-muted">{o.desc}</span>}
            {o.extra}
          </button>
        );
      })}
    </div>
  );
}

function Segment({ options, value, onChange, label }: { options: { id: string; label: string; desc?: string }[]; value: string; onChange(id: string): void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          title={o.desc || undefined}
          onClick={() => onChange(o.id === value ? '' : o.id)}
          className={cx('rounded px-2 py-0.5 text-xs', o.id === value ? 'bg-panel text-accent shadow-sm' : 'text-muted hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  desc,
  min,
  max,
  step = 1,
  left,
  right,
  value,
  onChange,
  diverging,
  clearLabel,
  inline,
}: {
  label?: string;
  desc?: string;
  min: number;
  max: number;
  step?: number;
  left?: string;
  right?: string;
  value: unknown;
  onChange(v: number | null): void;
  diverging?: boolean;
  clearLabel: string;
  inline?: boolean;
}) {
  const id = useId();
  const set = fin(value);
  const mid = diverging ? (min + max) / 2 : min;
  const v = set ? value : mid;
  return (
    <div className={cx('flex gap-1', inline ? 'flex-col sm:flex-row sm:items-center sm:gap-3' : 'flex-col')}>
      {(label || desc) && (
        <div className={cx('min-w-0', inline && 'sm:w-44 sm:shrink-0')}>
          {label && (
            <label htmlFor={id} className="text-xs font-medium text-text">
              {label}
            </label>
          )}
          {desc && <p className="text-[11px] leading-snug text-muted">{desc}</p>}
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {left && <span className={cx('w-24 shrink-0 text-right text-[11px] leading-tight', set && v < mid ? 'text-text' : 'text-muted')}>{left}</span>}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          aria-label={label || `${left ?? ''} – ${right ?? ''}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cx('h-4 min-w-0 flex-1 accent-[var(--accent)]', !set && 'opacity-40')}
        />
        {right && <span className={cx('w-24 shrink-0 text-[11px] leading-tight', set && v > mid ? 'text-text' : 'text-muted')}>{right}</span>}
        <output htmlFor={id} className="w-8 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
          {set ? value : '—'}
        </output>
        <IconButton
          label={clearLabel}
          icon={<X className="size-3" />}
          className={cx('size-5!', !set && 'invisible')}
          onClick={() => onChange(null)}
          tabIndex={set ? 0 : -1}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campo generico                                                      */
/* ------------------------------------------------------------------ */

export function FieldView<T extends object>({
  f,
  data,
  edit,
  ctx,
  build,
}: {
  f: FieldDef;
  data: T;
  edit: Edit<T>;
  ctx: FieldCtx;
  /** La costruzione (se `data` è l'impianto della storia è assente). */
  build?: CharacterBuild;
}) {
  const id = useId();
  const { M } = ctx;
  const t = M.t;
  const v = getPath(data, f.path);
  const set = (path: string, value: unknown) => edit((d) => void setPath(d, path, value));
  const toggleIn = (path: string, optId: string) =>
    edit((d) => {
      const arr = listOf<string>(d, path);
      setPath(d, path, arr.includes(optId) ? arr.filter((x) => x !== optId) : [...arr, optId]);
    });
  const options = f.options ?? [];
  const clear = t('Clear');

  switch (f.type) {
    case 'text':
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{f.label}</Label>
          <Input id={id} value={(v as string) ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.path, e.target.value)} />
          <Help>{f.help}</Help>
        </div>
      );
    case 'textarea':
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{f.label}</Label>
          <Textarea
            id={id}
            autoGrow
            rows={f.rows ?? 3}
            className={cx((f.rows ?? 3) <= 1 && 'min-h-0!')}
            value={(v as string) ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => set(f.path, e.target.value)}
          />
          <Help>{f.help}</Help>
        </div>
      );
    case 'trait': {
      const trait = M.K.EXPLICIT_TRAITS.find((x) => x.id === f.key)!;
      const b = data as unknown as CharacterBuild;
      const shown = !!b.outer?.expressed?.[f.key!];
      return (
        <div className={cx('flex flex-col gap-1 rounded-md border-l-2 pl-2.5', shown ? 'border-accent' : 'border-transparent')}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id}>{trait.label}</Label>
            <button
              type="button"
              aria-pressed={shown}
              title={shown ? t('Dramatized on the page') : t('Known only to the author — click to dramatize')}
              onClick={() => edit((d) => void setPath(d, `outer.expressed.${f.key}`, !shown))}
              className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]', shown ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text')}
            >
              {shown ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
              {shown ? t('on page') : t('author only')}
            </button>
          </div>
          {(f.rows ?? 2) === 1 ? (
            <Input id={id} value={(v as string) ?? ''} placeholder={trait.desc} onChange={(e) => set(f.path, e.target.value)} />
          ) : (
            <Textarea id={id} autoGrow rows={f.rows ?? 2} value={(v as string) ?? ''} placeholder={trait.desc} onChange={(e) => set(f.path, e.target.value)} />
          )}
        </div>
      );
    }
    case 'select':
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{f.label}</Label>
          <Select id={id} value={(v as string) ?? ''} onChange={(e) => set(f.path, e.target.value)}>
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          <Help>{f.help}</Help>
        </div>
      );
    case 'radio':
      return (
        <div className="flex flex-col gap-1">
          {f.label && <Label>{f.label}</Label>}
          {f.compact ? (
            <div>
              <Segment label={f.label} options={options} value={(v as string) ?? ''} onChange={(x) => set(f.path, x)} />
            </div>
          ) : (
            <OptionCards label={f.label} options={options} value={(v as string) ?? ''} onChange={(x) => set(f.path, x)} />
          )}
          <Help>{f.help}</Help>
        </div>
      );
    case 'chips':
      return (
        <div className="flex flex-col gap-1">
          {f.label && <Label>{f.label}</Label>}
          <Chips options={options} value={listOf<string>(data, f.path)} onToggle={(x) => toggleIn(f.path, x)} />
          <Help>{f.help}</Help>
        </div>
      );
    case 'checklist': {
      const on = listOf<string>(data, f.path);
      return (
        <div className="flex flex-col gap-1">
          {f.label && <Label>{f.label}</Label>}
          <div className={cx('grid gap-1', f.columns === 2 && 'sm:grid-cols-2')}>
            {options.map((o) => (
              <label
                key={o.id}
                className={cx('flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5', on.includes(o.id) ? 'border-accent/50 bg-accent-soft' : 'border-border hover:border-muted')}
              >
                <input type="checkbox" className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]" checked={on.includes(o.id)} onChange={() => toggleIn(f.path, o.id)} />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{o.label}</span>
                  {o.desc && <span className="text-xs leading-snug text-muted">{o.desc}</span>}
                </span>
              </label>
            ))}
          </div>
          <Help>{f.help}</Help>
        </div>
      );
    }
    case 'slider':
      return (
        <div className="flex flex-col gap-1">
          <Slider
            label={f.label}
            min={f.min ?? 0}
            max={f.max ?? 10}
            step={f.step}
            left={f.left}
            right={f.right}
            value={v}
            diverging={(f.min ?? 0) < 0}
            clearLabel={clear}
            onChange={(x) => set(f.path, x)}
          />
          <Help>{f.help}</Help>
        </div>
      );
    case 'spectra':
    case 'sliders': {
      const obj = (v ?? {}) as Record<string, number>;
      return (
        <div className="flex flex-col gap-2">
          {f.label && <Label>{f.label}</Label>}
          {(f.items ?? []).map((it) => (
            <Slider
              key={it.id}
              label={f.type === 'sliders' || f.showDesc ? it.label : undefined}
              desc={f.showDesc ? it.desc : undefined}
              left={f.type === 'spectra' ? it.left : undefined}
              right={f.type === 'spectra' ? it.right : undefined}
              min={f.min ?? 0}
              max={f.max ?? 10}
              step={(f.max ?? 10) > 20 ? 5 : 1}
              value={obj[it.id]}
              diverging={f.type === 'spectra'}
              inline={f.type === 'sliders'}
              clearLabel={clear}
              onChange={(x) =>
                edit((d) => {
                  const cur = { ...((getPath(d, f.path) as Record<string, number>) ?? {}) };
                  if (x == null) delete cur[it.id];
                  else cur[it.id] = x;
                  setPath(d, f.path, cur);
                })
              }
            />
          ))}
        </div>
      );
    }
    case 'toggle':
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={v === true} onChange={(e) => set(f.path, e.target.checked)} />
          {f.label}
        </label>
      );
    case 'custom':
      return <Custom f={f} data={data} edit={edit as Edit<unknown>} ctx={ctx} build={build} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Componenti personalizzati                                           */
/* ------------------------------------------------------------------ */

function ItemTools({ n, i, onMove, onRemove, M }: { n: number; i: number; onMove(dir: -1 | 1): void; onRemove(): void; M: McKeeData }) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={M.t('Move up')} icon={<ArrowUp className="size-3.5" />} disabled={i === 0} onClick={() => onMove(-1)} />
      <IconButton label={M.t('Move down')} icon={<ArrowDown className="size-3.5" />} disabled={i === n - 1} onClick={() => onMove(1)} />
      <IconButton label={M.t('Remove')} icon={<Trash2 className="size-3.5" />} className="hover:text-danger!" onClick={onRemove} />
    </div>
  );
}

function listOps<I extends { id: string }>(edit: Edit<unknown>, path: string) {
  return {
    add: (item: Omit<I, 'id'> & { id?: string }) =>
      edit((d) => void setPath(d, path, [...listOf<I>(d, path), { ...item, id: item.id ?? uid(path.split('.').pop()!.slice(0, 3)) }])),
    update: (i: number, patch: Partial<I>) =>
      edit((d) => {
        const arr = [...listOf<I>(d, path)];
        arr[i] = { ...arr[i], ...patch };
        setPath(d, path, arr);
      }),
    remove: (i: number) => edit((d) => void setPath(d, path, listOf<I>(d, path).filter((_, k) => k !== i))),
    move: (i: number, dir: -1 | 1) =>
      edit((d) => {
        const arr = [...listOf<I>(d, path)];
        const j = i + dir;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        setPath(d, path, arr);
      }),
  };
}

const card = 'flex flex-col gap-2 rounded-md border border-border bg-panel-2/40 p-2.5';

function Custom({ f, data, edit, ctx, build }: { f: FieldDef; data: unknown; edit: Edit<unknown>; ctx: FieldCtx; build?: CharacterBuild }) {
  const { M } = ctx;
  const { t, K } = M;
  const b = (build ?? data) as CharacterBuild;
  const set = (path: string, value: unknown) => edit((d) => void setPath(d, path, value));
  const personae = listOps<CharacterBuild['selves']['personae'][number]>(edit, 'selves.personae');
  const dims = listOps<CharacterBuild['dimensions'][number]>(edit, 'dimensions');
  const tps = listOps<CharacterBuild['arc']['turningPoints'][number]>(edit, 'arc.turningPoints');
  const scenes = listOps<CharacterBuild['action']['scenes'][number]>(edit, 'action.scenes');
  const rels = listOps<CharacterBuild['relationships'][number]>(edit, 'relationships');
  const clear = t('Clear');

  switch (f.component) {
    case 'personae':
      return (
        <div className="flex flex-col gap-2">
          {b.selves.personae.map((p, i) => (
            <div key={p.id} className={card}>
              <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                <Input value={p.with ?? ''} placeholder={t('With whom? (boss, mother, ex…)')} aria-label={t('With whom? (boss, mother, ex…)')} onChange={(e) => personae.update(i, { with: e.target.value })} />
                <Select value={p.axis ?? ''} aria-label={t('Axis…')} onChange={(e) => personae.update(i, { axis: e.target.value })}>
                  <option value="">{t('Axis…')}</option>
                  <option value="power">{t('Power (social)')}</option>
                  <option value="intimacy">{t('Intimacy (personal)')}</option>
                </Select>
              </div>
              <Textarea autoGrow rows={2} value={p.persona ?? ''} placeholder={t('Voice, eyes, posture, energy — the mask she wears')} onChange={(e) => personae.update(i, { persona: e.target.value })} />
              <div className="flex justify-end">
                <ItemTools M={M} n={b.selves.personae.length} i={i} onMove={(d) => personae.move(i, d)} onRemove={() => personae.remove(i)} />
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => personae.add({ with: '', axis: '', persona: '' })}>
              {t('Add a persona')}
            </Button>
          </div>
        </div>
      );

    case 'dimensions': {
      const list = b.dimensions;
      const sugg = K.DIMENSION_SUGGESTIONS.filter(([p, n]) => !list.some((d) => d.positive === p && d.negative === n)).slice(0, 14);
      const tests: [keyof (typeof list)[number], string, string][] = [
        ['consistent', t('Consistent'), t('A pattern, not a one-off kindness or a snit')],
        ['variable', t('Variable'), t('Unpredictable, progressing — not the same cat and dog every time')],
        ['unresolvable', t('Unresolvable'), t('It must seem impossible to settle')],
      ];
      return (
        <div className="flex flex-col gap-2">
          {!list.length && <p className="text-xs text-muted">{t('No dimensions yet. A dimension is a living contradiction — wise yet foolish, generous to some, selfish to others.')}</p>}
          {list.map((d, i) => (
            <div key={d.id} id={`dim-${d.id}`} className={cx(card, d.defining && 'border-accent/60')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ok">+</span>
                <Input className="w-auto! min-w-32 flex-1" value={d.positive ?? ''} placeholder={t('Positive pole')} aria-label={t('Positive pole')} onChange={(e) => dims.update(i, { positive: e.target.value })} />
                <span className="text-muted">/</span>
                <span className="font-mono text-xs text-danger">−</span>
                <Input className="w-auto! min-w-32 flex-1" value={d.negative ?? ''} placeholder={t('Negative pole')} aria-label={t('Negative pole')} onChange={(e) => dims.update(i, { negative: e.target.value })} />
                <button
                  type="button"
                  aria-pressed={!!d.defining}
                  title={t('Defining dimension')}
                  onClick={() =>
                    edit((draft) => {
                      const arr = listOf<CharacterBuild['dimensions'][number]>(draft, 'dimensions').map((x, k) => ({ ...x, defining: k === i ? !d.defining : false }));
                      setPath(draft, 'dimensions', arr);
                    })
                  }
                  className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs', d.defining ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text')}
                >
                  <Star className={cx('size-3.5', d.defining && 'fill-current')} aria-hidden />
                  {d.defining ? t('Defining') : t('Make defining')}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={d.type ?? ''} aria-label={t('Kind of contradiction…')} onChange={(e) => dims.update(i, { type: e.target.value })}>
                  <option value="">{t('Kind of contradiction…')}</option>
                  {K.DIMENSION_TYPES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select value={d.level ?? ''} aria-label={t('Level of self…')} onChange={(e) => dims.update(i, { level: e.target.value })}>
                  <option value="">{t('Level of self…')}</option>
                  {K.SELF_LEVELS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Textarea autoGrow rows={2} value={d.positiveExample ?? ''} placeholder={t('(+) when does she show this pole?')} onChange={(e) => dims.update(i, { positiveExample: e.target.value })} />
                <Textarea autoGrow rows={2} value={d.negativeExample ?? ''} placeholder={t('(−) and this one?')} onChange={(e) => dims.update(i, { negativeExample: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-3">
                  {tests.map(([k, l, tip]) => (
                    <label key={k} title={tip} className="inline-flex items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={!!d[k]} onChange={(e) => dims.update(i, { [k]: e.target.checked })} />
                      {l}
                    </label>
                  ))}
                </div>
                <ItemTools M={M} n={list.length} i={i} onMove={(x) => dims.move(i, x)} onRemove={() => dims.remove(i)} />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => dims.add({ positive: '', negative: '' })}>
              {t('Add a dimension')}
            </Button>
            <span className="text-xs text-muted">{t('or start from a pair:')}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {sugg.map(([p, n]) => (
              <button key={`${p}/${n}`} type="button" className="rounded-full border border-border px-2 py-0 text-[11px] text-muted hover:border-muted hover:text-text" onClick={() => dims.add({ positive: p, negative: n })}>
                {p} / {n}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case 'antagonism': {
      const a = b.complexity.antagonism;
      const notes = b.complexity.antagonismNotes;
      const heads: Record<string, string> = { physical: t('Physical conflict'), social: t('Social conflict'), personal: t('Personal conflict'), inner: t('Inner conflict') };
      let last = '';
      return (
        <div className="flex flex-col gap-2">
          {K.ANTAGONISM_FORCES.map((force) => {
            const head = force.level !== last ? <h4 className="mt-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{heads[force.level!] ?? force.level}</h4> : null;
            last = force.level!;
            return (
              <div key={force.id} className="flex flex-col gap-1">
                {head}
                <Slider
                  inline
                  label={force.label}
                  desc={force.desc}
                  min={0}
                  max={10}
                  value={a[force.id]}
                  clearLabel={clear}
                  onChange={(x) =>
                    edit((d) => {
                      const cur = { ...(getPath(d, 'complexity.antagonism') as Record<string, number>) };
                      if (x == null) delete cur[force.id];
                      else cur[force.id] = x;
                      setPath(d, 'complexity.antagonism', cur);
                    })
                  }
                />
                <Input className="h-7! text-xs" value={notes[force.id] ?? ''} placeholder={t('How does it bear down on her?')} onChange={(e) => set(`complexity.antagonismNotes.${force.id}`, e.target.value)} />
              </div>
            );
          })}
          <div className="mt-2 rounded-md border border-border p-2.5">
            <Slider
              label={t('Her capacities — mental, emotional, physical')}
              min={0}
              max={10}
              left={t('Feeble')}
              right={t('Formidable')}
              value={b.complexity.capacity}
              clearLabel={clear}
              onChange={(x) => set('complexity.capacity', x)}
            />
            <Help>{t('Weigh her in one hand and every negative power in the other. (Ch. 6)')}</Help>
          </div>
        </div>
      );
    }

    case 'dimensionPicker':
      return (
        <div className="flex flex-col gap-1">
          <Label>{f.label}</Label>
          <Select value={b.arc.dimensionId} aria-label={f.label} onChange={(e) => set('arc.dimensionId', e.target.value)}>
            <option value="">—</option>
            {b.dimensions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.positive || '?'} / {d.negative || '?'}
                {d.defining ? ' ★' : ''}
              </option>
            ))}
          </Select>
          {!b.dimensions.length && <Help>{t('Add dimensions first (station 09).')}</Help>}
        </div>
      );

    case 'turningPoints':
      return (
        <div className="flex flex-col gap-2">
          {b.arc.turningPoints.map((tp, i) => (
            <div key={tp.id} className={cx(card, 'sm:flex-row sm:items-center')}>
              <span className="w-5 shrink-0 font-mono text-xs text-muted">{i + 1}</span>
              <Input className="sm:flex-1" value={tp.label ?? ''} placeholder={t('What happens?')} aria-label={t('What happens?')} onChange={(e) => tps.update(i, { label: e.target.value })} />
              <div className="sm:w-64">
                <Slider min={-5} max={5} left="−" right="+" diverging value={fin(tp.charge) ? tp.charge : null} clearLabel={clear} onChange={(x) => tps.update(i, { charge: x ?? 0 })} />
              </div>
              <ItemTools M={M} n={b.arc.turningPoints.length} i={i} onMove={(x) => tps.move(i, x)} onRemove={() => tps.remove(i)} />
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => tps.add({ label: '', charge: 0 })}>
              {t('Add a turning point')}
            </Button>
          </div>
        </div>
      );

    case 'scenes':
      return (
        <div className="flex flex-col gap-2">
          {b.action.scenes.map((s, i) => {
            const turned = fin(s.from) && fin(s.to);
            const row = (key: keyof typeof s, label: string, placeholder = '', area = true) => (
              <div className="flex flex-col gap-1">
                <Label>{label}</Label>
                {area ? (
                  <Textarea autoGrow rows={2} value={(s[key] as string) ?? ''} placeholder={placeholder} onChange={(e) => scenes.update(i, { [key]: e.target.value })} />
                ) : (
                  <Input value={(s[key] as string) ?? ''} placeholder={placeholder} onChange={(e) => scenes.update(i, { [key]: e.target.value })} />
                )}
              </div>
            );
            return (
              <details key={s.id} className={card} open={i === b.action.scenes.length - 1}>
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium">
                  <span>
                    {i + 1}. {s.title || t('Untitled scene')}
                  </span>
                  {turned && (
                    <span className={cx('rounded border px-1.5 text-[11px]', s.to! > s.from! ? 'border-ok/40 text-ok' : s.to! < s.from! ? 'border-danger/40 text-danger' : 'border-warn/40 text-warn')}>
                      {s.value || t('value')} {s.from! > 0 ? '+' : ''}
                      {s.from} → {s.to! > 0 ? '+' : ''}
                      {s.to}
                    </span>
                  )}
                </summary>
                <div className="grid gap-2 sm:grid-cols-2">
                  {row('title', t('Scene'), t('Where / what'), false)}
                  {row('objective', t('Scene-objective — what she wants now'), t('A step toward the super-objective'))}
                  {row('action', t('First action (her MO)'))}
                  {row('expectation', t('Expectation — “if I do X, Y will happen”'))}
                  {row('counteraction', t('Counteraction'), t('What blocks her?'))}
                  <div className="flex flex-col gap-1">
                    <Label>{t('Source of counteraction')}</Label>
                    <Select value={s.source ?? ''} onChange={(e) => scenes.update(i, { source: e.target.value })}>
                      <option value="">—</option>
                      {K.COUNTERACTION_SOURCES.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {row('surprise', t('Surprise'), t('What does she suddenly discover?'))}
                  {row('value', t('Value at stake'), t('Truth, Safety, Love…'), false)}
                  <div className="flex flex-col gap-1">
                    <Label>{t('Charge at opening')}</Label>
                    <Slider min={-5} max={5} left="−" right="+" diverging value={s.from} clearLabel={clear} onChange={(x) => scenes.update(i, { from: x ?? undefined })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>{t('Charge at close')}</Label>
                    <Slider min={-5} max={5} left="−" right="+" diverging value={s.to} clearLabel={clear} onChange={(x) => scenes.update(i, { to: x ?? undefined })} />
                  </div>
                  {row('reaction', t('Reaction'), t('Her never-seen-before reaction'))}
                  {row('next', t('What she does next'))}
                </div>
                <div className="flex justify-end">
                  <ItemTools M={M} n={b.action.scenes.length} i={i} onMove={(x) => scenes.move(i, x)} onRemove={() => scenes.remove(i)} />
                </div>
              </details>
            );
          })}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => scenes.add({ title: '' })}>
              {t('Add a scene')}
            </Button>
          </div>
        </div>
      );

    case 'relationships': {
      const others = ctx.cast;
      if (!others.length) return <p className="text-xs text-muted">{t('This character has no castmates yet. Add characters to the story to link them.')}</p>;
      const dimOpts = b.dimensions.map((d) => ({ id: d.id, label: `${d.positive || '?'} / ${d.negative || '?'}` }));
      return (
        <div className="flex flex-col gap-2">
          {b.relationships.map((r, i) => (
            <div key={r.id} className={card}>
              <div className="grid gap-2 sm:grid-cols-3">
                <Select value={r.targetId ?? ''} aria-label={t('Character…')} onChange={(e) => rels.update(i, { targetId: e.target.value })}>
                  <option value="">{t('Character…')}</option>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  {r.targetId && !others.some((m) => m.id === r.targetId) && <option value={r.targetId}>?</option>}
                </Select>
                <Select value={r.kind ?? ''} aria-label={t('Kind…')} onChange={(e) => rels.update(i, { kind: e.target.value })}>
                  <option value="">{t('Kind…')}</option>
                  {K.RELATIONSHIP_KINDS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select value={r.effect ?? ''} aria-label={t('Helps/hinders…')} onChange={(e) => rels.update(i, { effect: e.target.value })}>
                  <option value="">{t('Helps/hinders…')}</option>
                  {K.RELATIONSHIP_EFFECTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
                <Input value={r.draws ?? ''} placeholder={t('Which trait or truth does this person draw out of her?')} onChange={(e) => rels.update(i, { draws: e.target.value })} />
                <Select value={r.dimensionId ?? ''} aria-label={t('Activates dimension…')} onChange={(e) => rels.update(i, { dimensionId: e.target.value })}>
                  <option value="">{t('Activates dimension…')}</option>
                  {dimOpts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Input value={r.bringsOut ?? ''} placeholder={t('And what does she bring out in them?')} onChange={(e) => rels.update(i, { bringsOut: e.target.value })} />
              <div className="flex justify-end">
                <ItemTools M={M} n={b.relationships.length} i={i} onMove={(x) => rels.move(i, x)} onRemove={() => rels.remove(i)} />
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => rels.add({ targetId: '', kind: '', effect: '' })}>
              {t('Link a cast member')}
            </Button>
          </div>
        </div>
      );
    }

    case 'genreInfo': {
      if (!ctx.story) return <p className="text-xs text-muted">{t('This character isn’t part of a story yet.')}</p>;
      const genres = ctx.story.genre.primary.map((id) => K.PRIMARY_GENRES.find((g) => g.id === id)).filter((g) => !!g);
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {genres.length ? (
            genres.map((g) => (
              <span key={g.id} className={cx('rounded border px-1.5 py-px text-[11px]', g.family === 'character' ? 'border-analysis/40 text-analysis' : 'border-narration/40 text-narration')}>
                {g.label}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted">{t('No genre chosen yet.')}</span>
          )}
          {ctx.storyLink}
        </div>
      );
    }

    case 'coreCastPicker': {
      const genres = (ctx.story?.genre.primary ?? []).map((id) => K.PRIMARY_GENRES.find((g) => g.id === id)).filter((g) => !!g);
      const roles = [...new Set(genres.flatMap((g) => g.coreCast))];
      const v = b.genre.coreCastRole;
      return (
        <div className="flex flex-col gap-1">
          <Label>{f.label}</Label>
          {roles.length > 0 && <Segment label={f.label} options={roles.map((r) => ({ id: r, label: t(r) }))} value={v} onChange={(x) => set('genre.coreCastRole', x)} />}
          <Input value={v} placeholder={t('Or type a position')} aria-label={f.label} onChange={(e) => set('genre.coreCastRole', e.target.value)} />
        </div>
      );
    }

    case 'moPicker': {
      const groups = [...new Set(K.MO_THEMES.map((m) => m.group!))];
      const titles: Record<string, string> = { Hollywood: t('Hollywood themes'), Political: t('Political themes'), Object: t('Object themes') };
      return (
        <div className="flex flex-col gap-2">
          <Label>{f.label}</Label>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <h5 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{titles[g] ?? g}</h5>
              <OptionCards
                columns={3}
                label={titles[g] ?? g}
                value={b.action.mo.theme}
                onChange={(x) => set('action.mo.theme', x)}
                options={K.MO_THEMES.filter((m) => m.group === g).map((m) => ({
                  id: m.id,
                  label: m.label,
                  desc: m.desc,
                  extra: <em className="text-[11px] leading-snug text-muted/80">{t('Twist: {twist}', { twist: m.twist })}</em>,
                }))}
              />
            </div>
          ))}
        </div>
      );
    }

    case 'genrePicker': {
      const story = data as StoryDesign;
      const v = story.genre.primary;
      const toggle = (id: string) => edit((d) => void setPath(d, 'genre.primary', v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
      const fam = (family: 'fortune' | 'character', title: string) => (
        <div className="flex flex-col gap-1.5">
          <h5 className="text-xs font-medium">{title}</h5>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {K.PRIMARY_GENRES.filter((g) => g.family === family).map((g) => {
              const on = v.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(g.id)}
                  className={cx('flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left', on ? 'border-accent/60 bg-accent-soft' : 'border-border hover:border-muted')}
                >
                  <span className={cx('text-sm font-medium', on && 'text-accent')}>{g.label}</span>
                  <span className="text-xs">{g.coreValue}</span>
                  <span className="text-[11px] leading-snug text-muted">
                    {g.coreEvent} · {g.coreEmotion}
                  </span>
                  <span className="text-[11px] text-muted/80">{g.coreCast.map((r) => t(r)).join(' · ')}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
      return (
        <div className="flex flex-col gap-2">
          <Label>{f.label}</Label>
          {fam('fortune', t('Ten plots of fortune — outer conditions change'))}
          {fam('character', t('Six plots of character — morality, mentality, humanity change'))}
          <Help>{t('Combine a plot of fortune with a plot of character to merge an outer spine with an inner arc. (Ch. 14)')}</Help>
        </div>
      );
    }
    default:
      return <Help>{t('Unknown component {name}', { name: f.component })}</Help>;
  }
}
