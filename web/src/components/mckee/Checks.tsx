import type { McKeeCheck } from '@persona/shared/mckee';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cx } from '../ui';

const ORDER = { warn: 0, tip: 1, good: 2 } as const;

/** Elenco delle verifiche McKee (avvisi, suggerimenti, punti di forza), con il capitolo di riferimento. */
export function ChecksList({ checks, empty, onOpen }: { checks: McKeeCheck[]; empty: string; onOpen?(section: string): void }) {
  if (!checks.length) return <p className="text-xs text-muted italic">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {[...checks]
        .sort((a, b) => ORDER[a.level] - ORDER[b.level])
        .map((x) => {
          const Icon = x.level === 'warn' ? AlertTriangle : x.level === 'good' ? CheckCircle2 : Info;
          const body = (
            <>
              <Icon className={cx('mt-0.5 size-3.5 shrink-0', x.level === 'warn' ? 'text-warn' : x.level === 'good' ? 'text-ok' : 'text-muted')} aria-hidden />
              <span className="flex flex-col">
                <b className="text-xs">{x.title}</b>
                <span className="text-xs text-muted">{x.detail}</span>
                <span className="text-[10px] text-muted/80">{x.ref}</span>
              </span>
            </>
          );
          return (
            <li key={x.id}>
              {onOpen ? (
                <button type="button" className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-panel-2" onClick={() => onOpen(x.section)}>
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-1 py-0.5">{body}</div>
              )}
            </li>
          );
        })}
    </ul>
  );
}
