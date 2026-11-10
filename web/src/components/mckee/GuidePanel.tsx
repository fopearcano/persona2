/**
 * Assistente di costruzione (PERSONA 2): si costruisce il personaggio chattando invece di
 * compilare i campi. Usa la stessa API del coach McKee in modalità `guide`: l'assistente
 * guida tappa per tappa e ogni risposta dell'autore diventa valori dei campi, applicati
 * subito alla bozza (costruzione e identità di base) e annullabili uno per uno.
 * Come sempre, l'identità cambia solo quando l'autore salva.
 */
import type { CoachMessage, CoachProposal, CoachUpdate } from '@persona/shared/client';
import { expectedSections, isIdentityPath, nextStation, overallProgress, type CharacterBuild, type McKeeData, type StoryDesign } from '@persona/shared/mckee';
import { Check, Loader2, MessageSquarePlus, Send, Sparkles, Square, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, cx, ErrorBox, IconButton, Select, Textarea } from '../ui';
import { trunc, type CaptureUndo, type IdentityDraft } from '../../lib/mckee';
import { formatValue } from './CoachPanel';
import { useCoachChat } from './useCoachChat';
import { ProgressRing } from './Viz';

function CaptureList({
  m,
  p,
  M,
  canUndo,
  onUndo,
}: {
  m: CoachMessage;
  p: CoachProposal;
  M: McKeeData;
  canUndo: boolean;
  onUndo(): void;
}) {
  const { t } = useTranslation();
  if (p.kind !== 'updates' || (!p.updates.length && !p.rejected.length)) return null;
  const label = (u: CoachUpdate) => (isIdentityPath(u.path) ? t(`editor.fields.${u.path.slice('identity.'.length)}`) : u.label);
  const undone = p.status === 'dismissed';
  return (
    <div className={cx('mt-2 rounded-md border px-2 py-1.5', undone ? 'border-dashed border-border opacity-60' : 'border-accent/30 bg-accent-soft/40')} data-message={m.id}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
          <Check className="size-3" aria-hidden />
          {undone ? t('mckee.guide.undone') : t('mckee.guide.captured', { count: p.updates.length })}
        </span>
        {canUndo && !undone && (
          <Button size="sm" variant="ghost" className="h-6! px-1.5! text-[11px]!" icon={<Undo2 className="size-3" />} onClick={onUndo}>
            {t('mckee.guide.undo')}
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {p.updates.map((u, i) => (
          <li key={i} className={cx('text-xs', undone && 'line-through')}>
            <b>{label(u)}</b>
            {u.op === 'append' ? ' +' : ''}: <span className="font-text text-muted">{trunc(formatValue(u.value, M), 220)}</span>
          </li>
        ))}
      </ul>
      {p.rejected.length > 0 && <p className="mt-1 text-[11px] text-warn">{t('mckee.coach.rejected', { count: p.rejected.length })}</p>}
    </div>
  );
}

export function GuidePanel({
  characterId,
  name,
  draft,
  identity,
  projectId,
  focus,
  M,
  onCapture,
  onUndo,
}: {
  characterId: string;
  name: string;
  draft: CharacterBuild;
  identity: IdentityDraft;
  projectId: string | null;
  /** Tappa scelta dall'autore nella barra laterale (null = la sceglie l'assistente). */
  focus: string | null;
  M: McKeeData;
  /** Applica alla bozza e restituisce come annullare. */
  onCapture(updates: CoachUpdate[]): CaptureUndo;
  onUndo(undo: CaptureUndo): void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [undos, setUndos] = useState<Record<string, CaptureUndo>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chat = useCoachChat({
    characterId,
    mode: 'guide',
    body: () => ({ projectId, section: focus, draft, identityDraft: identity }),
    // Le risposte dell'assistente vengono applicate subito alla bozza.
    onDone: (m) => {
      for (const p of m.proposals) {
        if (p.kind !== 'updates' || p.status !== 'pending' || !p.updates.length) continue;
        const undo = onCapture(p.updates);
        setUndos((u) => ({ ...u, [p.id]: undo }));
        void chat.setProposalStatus(m.id, p, 'applied');
      }
    },
  });
  const { threads, threadId, messages, streaming, error } = chat;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming?.text]);

  const send = (content: string) => {
    setText('');
    void chat.send(content);
    inputRef.current?.focus();
  };

  const undo = async (m: CoachMessage, p: CoachProposal) => {
    const u = undos[p.id];
    if (!u) return;
    onUndo(u);
    setUndos(({ [p.id]: _gone, ...rest }) => rest);
    await chat.setProposalStatus(m.id, p, 'dismissed');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
        <h2 className="text-sm font-semibold">{t('mckee.guide.title')}</h2>
        <Select aria-label={t('mckee.guide.threads')} className="ml-auto h-7! w-56! py-0! text-xs" value={threadId ?? ''} onChange={(e) => chat.selectThread(e.target.value || null)}>
          <option value="">{t('mckee.guide.newThread')}</option>
          {threads.map((th) => (
            <option key={th.id} value={th.id}>
              {th.title}
            </option>
          ))}
        </Select>
        <IconButton label={t('mckee.guide.newThread')} icon={<MessageSquarePlus className="size-4" />} onClick={() => chat.selectThread(null)} />
        {threadId && (
          <IconButton
            label={t('mckee.coach.deleteThread')}
            icon={<Trash2 className="size-4" />}
            onClick={() => {
              if (window.confirm(t('mckee.coach.deleteThreadConfirm'))) void chat.removeThread();
            }}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
          {!messages.length && !streaming && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-panel p-5">
              <h3 className="text-base font-semibold">{t('mckee.guide.emptyTitle', { name })}</h3>
              <p className="text-sm text-muted">{t('mckee.guide.emptyIntro')}</p>
              <p className="text-sm text-muted">{t('mckee.guide.emptyFree')}</p>
              <Button variant="primary" icon={<Sparkles className="size-3.5" />} onClick={() => send(t('mckee.guide.startPrompt', { name }))}>
                {t('mckee.guide.start')}
              </Button>
            </div>
          )}
          {messages.map((m) => {
            const author = m.role === 'author';
            return (
              <div key={m.id} className={cx('flex flex-col', author ? 'items-end' : 'items-start')}>
                <div className={cx('max-w-[85%] rounded-lg px-3 py-2 text-sm', author ? 'bg-accent-soft' : 'border border-border bg-panel')}>
                  <div className="prose-msg whitespace-pre-wrap">{m.content || (m.status === 'error' ? '—' : '')}</div>
                  {m.status === 'incomplete' && <Badge tone="warn">{t('mckee.coach.incomplete')}</Badge>}
                  {m.proposals.map((p) => (
                    <CaptureList key={p.id} m={m} p={p} M={M} canUndo={!!undos[p.id]} onUndo={() => void undo(m, p)} />
                  ))}
                </div>
                {!author && m.meta?.model && <span className="mt-0.5 text-[10px] text-muted">{m.meta.model}</span>}
              </div>
            );
          })}
          {streaming && (
            <div className="max-w-[85%] rounded-lg border border-border bg-panel px-3 py-2 text-sm">
              {streaming.reasoning && !streaming.text && <p className="text-xs text-muted italic">{t('mckee.coach.reasoning')}…</p>}
              <div className="prose-msg whitespace-pre-wrap">{streaming.text || <Loader2 className="size-4 animate-spin text-muted" aria-label={t('common.loading')} />}</div>
            </div>
          )}
          {error ? <ErrorBox error={error} /> : null}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            rows={2}
            autoGrow
            value={text}
            className="min-h-0! text-sm"
            placeholder={t('mckee.guide.placeholder')}
            aria-label={t('mckee.guide.placeholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          {streaming ? (
            <IconButton label={t('mckee.coach.stop')} icon={<Square className="size-4" />} onClick={chat.stop} />
          ) : (
            <IconButton label={t('mckee.coach.send')} icon={<Send className="size-4" />} disabled={!text.trim()} onClick={() => send(text)} />
          )}
        </div>
      </form>
    </div>
  );
}

/** Barra laterale dell'assistente: avanzamento, tappa in corso (si può scegliere), identità di base. */
export function GuideRail({
  draft,
  identity,
  characterId,
  story,
  focus,
  M,
  onFocus,
  onOpenFields,
}: {
  draft: CharacterBuild;
  identity: IdentityDraft;
  characterId: string;
  story: StoryDesign | null;
  focus: string | null;
  M: McKeeData;
  onFocus(id: string | null): void;
  onOpenFields(station: string): void;
}) {
  const { t } = useTranslation();
  const me = { ...draft, id: characterId, name: identity.name ?? '' };
  const progress = overallProgress(me, story);
  const expected = new Set(expectedSections(me));
  const auto = nextStation(me, story);
  const current = focus ?? auto;
  const basics = (['name', 'age', 'origin', 'occupation'] as const).map((k) => [k, identity[k]] as const);
  return (
    <div className="flex flex-col gap-3 p-3">
      <section className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3">
        <ProgressRing ratio={progress.ratio} size={48} label={M.t('{pct}% complete', { pct: Math.round(progress.ratio * 100) })} />
        <div className="min-w-0 text-xs">
          <p className="font-semibold">{t('mckee.guide.progress')}</p>
          <p className="text-muted">{current ? t('mckee.guide.working', { station: `${M.SECTION_BY_ID[current].num} ${M.SECTION_BY_ID[current].title}` }) : t('mckee.guide.complete')}</p>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-panel">
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-xs font-semibold">{t('mckee.build.stations')}</h3>
          {focus && (
            <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => onFocus(null)}>
              {t('mckee.guide.autoFocus')}
            </button>
          )}
        </header>
        <p className="px-3 pt-2 text-[11px] text-muted">{t('mckee.guide.focusHelp')}</p>
        <ul className="p-1.5">
          {M.SECTIONS.filter((s) => expected.has(s.id)).map((s) => {
            const b = progress.bySection[s.id];
            const active = s.id === current;
            return (
              <li key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={focus === s.id}
                  onClick={() => onFocus(focus === s.id ? null : s.id)}
                  className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-xs', active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2 hover:text-text')}
                >
                  <span className="w-5 font-mono text-[10px]">{s.num}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="h-1 w-10 overflow-hidden rounded-full bg-panel-2">
                    <span className="block h-full bg-accent" style={{ width: `${Math.round(b.ratio * 100)}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="rounded-lg border border-border bg-panel p-3">
        <h3 className="mb-1.5 text-xs font-semibold">{t('mckee.guide.identity')}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
          {basics.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{t(`editor.fields.${k}`)}</dt>
              <dd className="truncate">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Button size="sm" variant="ghost" onClick={() => onOpenFields(current ?? 'spark')}>
        {t('mckee.guide.openFields')}
      </Button>
    </div>
  );
}
