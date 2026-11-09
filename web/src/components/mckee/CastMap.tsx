/**
 * Mappa del cast: i cerchi concentrici di McKee attorno al protagonista (Cap. 6, 17).
 * I personaggi si trascinano tra le orbite; le frecce curve mostrano chi aiuta o ostacola chi.
 */
import type { CastMember } from '@persona/shared/client';
import { initials, type McKeeData } from '@persona/shared/mckee';
import { useRef, useState } from 'react';
import { cx } from '../ui';

const SIZE = 640;
const C = SIZE / 2;
const RINGS = [0, 138, 214, 284];
const BOUNDS = [70, 176, 249];
const CIRCLE_IDS = ['protagonist', 'first', 'second', 'third'];

interface Pos {
  x: number;
  y: number;
  ring: number | null;
}

function positions(cast: CastMember[], M: McKeeData): Record<string, Pos> {
  const pos: Record<string, Pos> = {};
  const byRing: CastMember[][] = [[], [], [], []];
  const unplaced: CastMember[] = [];
  for (const c of cast) {
    const ring = M.K.CIRCLES.find((x) => x.id === c.build.cast.circle)?.ring;
    if (ring == null) unplaced.push(c);
    else byRing[ring].push(c);
  }
  byRing.forEach((members, ring) => {
    if (ring === 0) {
      members.forEach((c, i) => {
        const a = members.length === 1 ? 0 : (2 * Math.PI * i) / members.length;
        const r = members.length === 1 ? 0 : 34;
        pos[c.id] = { x: C + r * Math.cos(a), y: C + r * Math.sin(a), ring };
      });
      return;
    }
    members.forEach((c, i) => {
      const auto = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(members.length, 1) + ring * 0.45;
      const angle = c.build.cast.mapAngle;
      const a = typeof angle === 'number' && Number.isFinite(angle) ? angle : auto;
      pos[c.id] = { x: C + RINGS[ring] * Math.cos(a), y: C + RINGS[ring] * Math.sin(a), ring };
    });
  });
  unplaced.forEach((c, i) => {
    pos[c.id] = { x: 34 + i * 46, y: SIZE - 26, ring: null };
  });
  return pos;
}

const EFFECT = { helps: 'stroke-ok', hinders: 'stroke-danger', both: 'stroke-warn' } as Record<string, string>;

export function CastMap({
  cast,
  M,
  title,
  onMove,
  onOpen,
}: {
  cast: CastMember[];
  M: McKeeData;
  title: string;
  onMove(id: string, circle: string, angle: number): void;
  onOpen(id: string): void;
}) {
  const { t } = M;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; start: { x: number; y: number }; moved: boolean; p?: { x: number; y: number }; ring?: number } | null>(null);
  const pos = positions(cast, M);
  const ids = new Set(cast.map((c) => c.id));
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  };

  const edges: { key: string; d: string; cls: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const c of cast) {
    for (const r of c.build.relationships) {
      if (!r.targetId || !ids.has(r.targetId) || !pos[c.id] || !pos[r.targetId]) continue;
      const key = [c.id, r.targetId].sort().join('|');
      const both = seen.has(key);
      seen.add(key);
      const a = drag?.id === c.id && drag.p ? drag.p : pos[c.id];
      const b = drag?.id === r.targetId && drag.p ? drag.p : pos[r.targetId];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const bend = both ? -0.18 : 0.18;
      const qx = mx - (b.y - a.y) * bend;
      const qy = my + (b.x - a.x) * bend;
      const kind = M.K.RELATIONSHIP_KINDS.find((k) => k.id === r.kind)?.label ?? t('link');
      const target = cast.find((x) => x.id === r.targetId)!;
      edges.push({
        key: `${c.id}-${r.id}`,
        d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        cls: EFFECT[r.effect ?? ''] ?? 'stroke-muted',
        title: `${c.name} → ${target.name}: ${kind}${r.draws ? ` — ${t('draws out {what}', { what: r.draws })}` : ''}`,
      });
    }
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={t('Cast map of {title}', { title })}
        className="mx-auto block h-auto w-full max-w-[40rem] touch-none select-none"
        onPointerMove={(e) => {
          if (!drag) return;
          const p = toSvg(e);
          const moved = drag.moved || Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4;
          const d = Math.hypot(p.x - C, p.y - C);
          const ring = d < BOUNDS[0] ? 0 : d < BOUNDS[1] ? 1 : d < BOUNDS[2] ? 2 : 3;
          setDrag({ ...drag, moved, p, ring });
        }}
        onPointerUp={() => {
          if (!drag) return;
          const { id, moved, p, ring } = drag;
          setDrag(null);
          if (!moved) return onOpen(id);
          if (!p || ring == null) return;
          onMove(id, CIRCLE_IDS[ring], Math.round(Math.atan2(p.y - C, p.x - C) * 1000) / 1000);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <marker id="cm-arrow" viewBox="0 0 10 10" refX={22} refY={5} markerWidth={7} markerHeight={7} orient="auto">
            <path d="M0 0 L10 5 L0 10z" className="fill-muted" />
          </marker>
        </defs>
        <circle cx={C} cy={C} r={110} className="fill-accent/5" />
        {RINGS.slice(1).map((r, i) => (
          <circle key={r} cx={C} cy={C} r={r} className={cx('fill-none', drag?.moved && drag.ring === i + 1 ? 'stroke-accent' : 'stroke-border')} strokeWidth={drag?.moved && drag.ring === i + 1 ? 2 : 1} strokeDasharray="4 6" />
        ))}
        <circle cx={C} cy={C} r={BOUNDS[0]} className={cx(drag?.moved && drag.ring === 0 ? 'fill-accent/15 stroke-accent' : 'fill-accent/10 stroke-accent/40')} />
        {[t('1st'), t('2nd'), t('3rd')].map((tag, i) => {
          const a = (3 * Math.PI) / 4;
          return (
            <text key={tag} x={(C + RINGS[i + 1] * Math.cos(a)).toFixed(1)} y={(C + RINGS[i + 1] * Math.sin(a) + 4).toFixed(1)} textAnchor="middle" fontSize={12} className="fill-muted">
              {tag}
            </text>
          );
        })}
        {edges.map((e) => (
          <path key={e.key} d={e.d} className={cx('fill-none opacity-70', e.cls)} strokeWidth={1.5} markerEnd="url(#cm-arrow)">
            <title>{e.title}</title>
          </path>
        ))}
        {cast.map((c) => {
          const p = drag?.id === c.id && drag.p ? drag.p : pos[c.id];
          const ring = pos[c.id].ring;
          const r = ring === 0 ? 30 : ring === 1 ? 23 : ring === 2 ? 18 : 14;
          const dims = Math.min(c.build.dimensions.length, 12);
          return (
            <g
              key={c.id}
              transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
              tabIndex={0}
              role="button"
              aria-label={c.name}
              className="cursor-grab outline-none focus-visible:[&>circle:first-child]:stroke-accent"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                setDrag({ id: c.id, start: toSvg(e), moved: false });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(c.id);
                }
              }}
            >
              <circle r={r + 6} className="fill-transparent stroke-transparent" strokeWidth={2} />
              <circle r={r} className={ring === 0 ? 'fill-accent stroke-accent' : 'fill-panel-2 stroke-muted'} strokeWidth={1.5} />
              {Array.from({ length: dims }, (_, i) => {
                const a = -Math.PI / 2 + (2 * Math.PI * i) / dims;
                return <circle key={i} cx={((r + 4) * Math.cos(a)).toFixed(1)} cy={((r + 4) * Math.sin(a)).toFixed(1)} r={2.2} className="fill-analysis" />;
              })}
              <text y={ring === 0 ? 6 : 4} textAnchor="middle" fontSize={Math.max(10, r * 0.62)} className={ring === 0 ? 'fill-accent-fg font-semibold' : 'fill-text font-semibold'}>
                {initials(c.name)}
              </text>
              <text y={r + 17} textAnchor="middle" fontSize={12} className="fill-text">
                {c.name}
              </text>
              {c.build.concept.roleLabel && (
                <text y={r + 30} textAnchor="middle" fontSize={10} className="fill-muted">
                  {c.build.concept.roleLabel}
                </text>
              )}
            </g>
          );
        })}
        {cast.some((c) => pos[c.id].ring == null) && (
          <text x={12} y={SIZE - 50} fontSize={11} className="fill-muted">
            {t('Unplaced — drag into an orbit')}
          </text>
        )}
        {!cast.length && (
          <text x={C} y={C + 4} textAnchor="middle" fontSize={13} className="fill-muted">
            {t('Add characters to populate the cast')}
          </text>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>
          <b className="text-text">{t('Centre')}</b> {t('protagonist')}
        </span>
        <span>
          <b className="text-text">{t('1st')}</b> {t('major support & service')}
        </span>
        <span>
          <b className="text-text">{t('2nd')}</b> {t('one dimension or a vivid trait')}
        </span>
        <span>
          <b className="text-text">{t('3rd')}</b> {t('bit parts & crowds')}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 text-[11px]">
        <span className="text-ok">— {t('helps')}</span>
        <span className="text-danger">— {t('hinders')}</span>
        <span className="text-warn">— {t('both')}</span>
        <span className="text-analysis">● {t('dots = dimensions')}</span>
      </div>
    </div>
  );
}
