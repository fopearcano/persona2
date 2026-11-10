/**
 * Pannello del coach McKee: conversazione con proposte da applicare alla bozza, e ricerca
 * nel libro. Il coach non modifica mai l'identità: l'autore applica le proposte alla bozza
 * e poi salva (revisione dell'identità).
 */
import type { BookSearchResult, CoachCastSuggestion, CoachMessage, CoachProposal, CoachUpdate } from '@persona/shared/client';
import type { CharacterBuild, McKeeData } from '@persona/shared/mckee';
import { BookOpen, Check, Loader2, MessageSquarePlus, Search, Send, Square, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { useBook } from '../../api/hooks';
import { useUi } from '../../stores/ui';
import { Badge, Button, Checkbox, cx, ErrorBox, IconButton, Input, Select, Tabs, Textarea, useErrorText } from '../ui';
import { type CoachSendOptions, useCoachChat } from './useCoachChat';

export interface CoachRequest {
  /** Messaggio da inviare subito (es. dalla domanda della stazione o dalla distillazione). */
  content: string;
  transcriptConversationId?: string | null;
  /** Apre la scheda del libro con questa ricerca (titolo inglese della stazione). */
  book?: string;
  nonce: number;
}

export function formatValue(v: unknown, M: McKeeData): string {
  if (Array.isArray(v)) return v.map((x) => formatValue(x, M)).join(', ');
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('positive' in o || 'negative' in o) return `${o.positive ?? '?'} / ${o.negative ?? '?'}`;
    return Object.entries(o)
      .filter(([k, x]) => k !== 'id' && x !== '' && x != null)
      .map(([k, x]) => `${k}: ${String(x)}`)
      .join('; ');
  }
  if (typeof v === 'boolean') return v ? M.t('Yes') : M.t('No');
  return String(v ?? '');
}

function ProposalCard({
  p,
  M,
  onApply,
  onDismiss,
  onAddCast,
}: {
  p: CoachProposal;
  M: McKeeData;
  onApply(updates: CoachUpdate[]): Promise<void>;
  onDismiss(): Promise<void>;
  onAddCast(member: CoachCastSuggestion): Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(p.updates.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const done = p.status !== 'pending';
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cx('mt-2 rounded-md border p-2', done ? 'border-border opacity-70' : 'border-accent/40 bg-accent-soft/40')}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">
          {p.kind === 'cast' ? <UserPlus className="mr-1 inline size-3.5" aria-hidden /> : null}
          {p.summary || t('mckee.coach.proposal')}
        </span>
        {p.status === 'applied' && <Badge tone="ok">{t('mckee.coach.applied')}</Badge>}
        {p.status === 'dismissed' && <Badge>{t('mckee.coach.dismissed')}</Badge>}
      </div>
      {p.kind === 'updates' && (
        <ul className="flex flex-col gap-1">
          {p.updates.map((u, i) => (
            <li key={i} className="text-xs">
              <Checkbox
                disabled={done}
                checked={selected.has(i)}
                onChange={(on) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (on) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
                label={
                  <span>
                    <b>{u.label}</b>
                    {u.op === 'append' ? ' +' : ''}: <span className="font-text">{formatValue(u.value, M)}</span>
                  </span>
                }
              />
              {u.rationale && <p className="ml-5 text-[11px] text-muted">{u.rationale}</p>}
            </li>
          ))}
        </ul>
      )}
      {p.kind === 'cast' && p.member && (
        <div className="text-xs">
          <p>
            <b>{p.member.name}</b> — {p.member.roleLabel} · {M.K.CIRCLES.find((c) => c.id === p.member!.circle)?.label}
          </p>
          {p.member.logline && <p className="font-text text-muted">{p.member.logline}</p>}
          {p.member.draws && (
            <p className="text-muted">
              {M.t('draws out {what}', { what: p.member.draws })}
            </p>
          )}
          {p.member.reason && <p className="mt-1 text-[11px] text-muted">{p.member.reason}</p>}
        </div>
      )}
      {p.rejected.length > 0 && <p className="mt-1 text-[11px] text-warn">{t('mckee.coach.rejected', { count: p.rejected.length })}</p>}
      {!done && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.kind === 'updates' ? (
            <Button size="sm" variant="primary" loading={busy} disabled={!selected.size} icon={<Check className="size-3.5" />} onClick={() => run(() => onApply(p.updates.filter((_, i) => selected.has(i))))}>
              {t('mckee.coach.apply')}
            </Button>
          ) : (
            <Button size="sm" variant="primary" loading={busy} icon={<UserPlus className="size-3.5" />} onClick={() => run(() => onAddCast(p.member!))}>
              {t('mckee.coach.addCast')}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} icon={<X className="size-3.5" />} onClick={() => run(onDismiss)}>
            {t('mckee.coach.dismiss')}
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageView({ m, M, actions }: { m: CoachMessage; M: McKeeData; actions: (m: CoachMessage, p: CoachProposal) => Parameters<typeof ProposalCard>[0] }) {
  const { t } = useTranslation();
  const author = m.role === 'author';
  return (
    <div className={cx('flex flex-col', author ? 'items-end' : 'items-start')}>
      <div className={cx('max-w-full rounded-lg px-3 py-2 text-sm', author ? 'bg-accent-soft' : 'border border-border bg-panel')}>
        {m.reasoning && (
          <details className="mb-1 text-xs text-muted">
            <summary className="cursor-pointer">{t('mckee.coach.reasoning')}</summary>
            <p className="whitespace-pre-wrap">{m.reasoning}</p>
          </details>
        )}
        <div className="prose-msg whitespace-pre-wrap">{m.content || (m.status === 'error' ? '—' : '')}</div>
        {m.meta?.book.length ? (
          <p className="mt-1 text-[11px] text-muted">
            <BookOpen className="mr-1 inline size-3" aria-hidden />
            {t('mckee.coach.bookUsed', { list: m.meta.book.map((b) => b.chapter).filter((x, i, a) => a.indexOf(x) === i).join('; ') })}
          </p>
        ) : null}
        {m.status === 'incomplete' && <Badge tone="warn">{t('mckee.coach.incomplete')}</Badge>}
        {m.proposals.map((p) => (
          <ProposalCard key={p.id} {...actions(m, p)} />
        ))}
      </div>
      {!author && m.meta?.model && <span className="mt-0.5 text-[10px] text-muted">{m.meta.model}</span>}
      {author && m.section && <span className="mt-0.5 text-[10px] text-muted">{M.SECTION_BY_ID[m.section]?.num} {M.SECTION_BY_ID[m.section]?.title}</span>}
    </div>
  );
}

export function CoachPanel({
  characterId,
  draft,
  projectId,
  section,
  M,
  request,
  onApply,
  onAddCast,
  onClose,
}: {
  characterId: string;
  draft: CharacterBuild;
  projectId: string | null;
  section: string | null;
  M: McKeeData;
  request: CoachRequest | null;
  onApply(updates: CoachUpdate[]): void;
  onAddCast(member: CoachCastSuggestion): Promise<void>;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'coach' | 'book'>('coach');
  const [bookQuery, setBookQuery] = useState('');
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const lastRequest = useRef<number | null>(null);
  const chat = useCoachChat({ characterId, mode: 'coach', body: () => ({ projectId, section, draft }) });
  const { threads, threadId, messages, streaming, error } = chat;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming?.text]);

  const send = (content: string, opts?: CoachSendOptions) => {
    setText('');
    return chat.send(content, opts);
  };

  // Richieste esterne (domande della tappa, distillazione di una conversazione).
  useEffect(() => {
    if (!request || lastRequest.current === request.nonce) return;
    lastRequest.current = request.nonce;
    if (request.book) {
      setTab('book');
      setBookQuery(request.book);
      return;
    }
    setTab('coach');
    if (!request.content) return;
    void send(request.content, { transcriptConversationId: request.transcriptConversationId, newThread: !!request.transcriptConversationId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const setStatus = (m: CoachMessage, p: CoachProposal, status: 'applied' | 'dismissed') => chat.setProposalStatus(m.id, p, status);

  const actions = (m: CoachMessage, p: CoachProposal) => ({
    p,
    M,
    onApply: async (updates: CoachUpdate[]) => {
      onApply(updates);
      await setStatus(m, p, 'applied');
      toast(t('mckee.coach.appliedToast'), 'success');
    },
    onDismiss: async () => {
      await setStatus(m, p, 'dismissed');
    },
    onAddCast: async (member: CoachCastSuggestion) => {
      try {
        await onAddCast(member);
        await setStatus(m, p, 'applied');
      } catch (err) {
        toast(errorText(err), 'error');
      }
    },
  });

  const removeThread = async () => {
    if (!threadId || !window.confirm(t('mckee.coach.deleteThreadConfirm'))) return;
    await chat.removeThread();
  };

  const station = section ? M.SECTION_BY_ID[section] : null;
  const stationName = station ? `${station.num} ${station.title}` : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{t('mckee.coach.title')}</h2>
        <IconButton label={t('common.close')} icon={<X className="size-4" />} onClick={onClose} />
      </div>
      <Tabs
        className="px-2"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'coach', label: t('mckee.coach.tabs.coach') },
          { id: 'book', label: t('mckee.coach.tabs.book') },
        ]}
      />
      {tab === 'book' ? (
        <BookSearch key={bookQuery} initialQuery={bookQuery} />
      ) : (
        <>
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <Select
              aria-label={t('mckee.coach.threads')}
              className="h-7! flex-1 py-0! text-xs"
              value={threadId ?? ''}
              onChange={(e) => chat.selectThread(e.target.value || null)}
            >
              <option value="">{t('mckee.coach.newThread')}</option>
              {threads.map((th) => (
                <option key={th.id} value={th.id}>
                  {th.title}
                </option>
              ))}
            </Select>
            <IconButton
              label={t('mckee.coach.newThread')}
              icon={<MessageSquarePlus className="size-4" />}
              onClick={() => chat.selectThread(null)}
            />
            {threadId && <IconButton label={t('mckee.coach.deleteThread')} icon={<Trash2 className="size-4" />} onClick={removeThread} />}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {!messages.length && !streaming && (
              <div className="flex flex-col gap-2 text-xs text-muted">
                <p>{t('mckee.coach.intro')}</p>
                {station && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => send(t('mckee.coach.brainstormPrompt', { station: stationName }))}>
                      {t('mckee.coach.brainstorm')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => send(t('mckee.coach.critiquePrompt', { station: stationName }))}>
                      {t('mckee.coach.critique')}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((m) => (
                <MessageView key={m.id} m={m} M={M} actions={actions} />
              ))}
              {streaming && (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm">
                  {streaming.reasoning && !streaming.text && <p className="text-xs text-muted italic">{t('mckee.coach.reasoning')}…</p>}
                  <div className="prose-msg whitespace-pre-wrap">{streaming.text || <Loader2 className="size-4 animate-spin text-muted" aria-label={t('common.loading')} />}</div>
                </div>
              )}
              {error ? <ErrorBox error={error} /> : null}
              <div ref={endRef} />
            </div>
          </div>
          <form
            className="flex items-end gap-1.5 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <Textarea
              rows={2}
              value={text}
              className="min-h-0! text-sm"
              placeholder={t('mckee.coach.placeholder')}
              aria-label={t('mckee.coach.placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
            />
            {streaming ? (
              <IconButton label={t('mckee.coach.stop')} icon={<Square className="size-4" />} onClick={chat.stop} />
            ) : (
              <IconButton label={t('mckee.coach.send')} icon={<Send className="size-4" />} disabled={!text.trim()} onClick={() => void send(text)} />
            )}
          </form>
        </>
      )}
    </div>
  );
}

/** Ricerca locale nella copia dell'autore del libro (nessun motore necessario). */
export function BookSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const { t, i18n } = useTranslation();
  const { data: book } = useBook();
  const [q, setQ] = useState(initialQuery);
  const [res, setRes] = useState<BookSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async (query: string) => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setRes(await api.get<BookSearchResult>(`/api/book/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(i18n.language)}`));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialQuery && book?.available) void search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, book?.available]);
  if (book && !book.available) {
    return (
      <div className="p-3 text-xs text-muted">
        <p>{t('mckee.book.noBook')}</p>
        <Link to="/settings#mckee-book" className="mt-1 inline-block text-accent hover:underline">
          {t('mckee.book.settingsLink')}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex gap-1.5 border-b border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <Input value={q} placeholder={t('mckee.book.searchPlaceholder')} aria-label={t('mckee.book.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" size="sm" loading={busy} icon={<Search className="size-3.5" />}>
          {t('common.search')}
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {book?.title && <p className="mb-2 text-[11px] text-muted">{book.title}</p>}
        {res && !res.results.length && <p className="text-xs text-muted">{t('mckee.book.noResults')}</p>}
        <div className="flex flex-col gap-2">
          {res?.results.map((r, i) => (
            <article key={i} className="rounded-md border border-border p-2">
              <h4 className="text-xs font-semibold">
                {r.chapter}
                {r.section && <span className="font-normal text-muted"> · {r.section}</span>}
              </h4>
              <p className="mt-1 font-text text-xs leading-relaxed whitespace-pre-wrap">{r.text}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
