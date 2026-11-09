import type { ContextMeta, DialogueMode, MemoryProcessingResult, Message, MessageRole, StreamEvent, TurnMode } from '@persona/shared/client';
import { TURN_MODES } from '@persona/shared/client';
import { Archive, ArchiveRestore, BrainCircuit, Eye, EyeOff, FastForward, PanelRight, Pencil, Send, SkipForward, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { api, streamPost } from '../../api/client';
import { useCharacters, useConversation, useInvalidate, useScenario } from '../../api/hooks';
import { useUi } from '../../stores/ui';
import { LanguageSelect } from '../LanguageSelect';
import { Badge, Button, cx, ErrorBox, IconButton, Input, Segmented, Select, Spinner, Textarea, useErrorText } from '../ui';
import { EngineBadge } from './EngineBadge';
import { Inspector } from './Inspector';
import { MessageItem, RichText } from './MessageItem';

interface LiveStream {
  messageId: string | null;
  speakerName: string | null;
  role: MessageRole;
  text: string;
}

/**
 * Spazio di lavoro conversazionale condiviso da Laboratorio, sessioni narrative e simulazioni.
 * Lo streaming arriva via SSE; i messaggi salvati vengono poi ricaricati dal backend.
 */
export function ChatWorkspace({ conversationId, onDeleted }: { conversationId: string; onDeleted?(): void }) {
  const { t } = useTranslation();
  const [showSuperseded, setShowSuperseded] = useState(false);
  const { data: conv, isLoading, error, refetch } = useConversation(conversationId, showSuperseded);
  const { data: scenario } = useScenario(conv?.scenarioId ?? undefined);
  const { data: characters } = useCharacters();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const inspectorOpen = useUi((s) => s.inspectorOpen);
  const toggleInspector = useUi((s) => s.toggleInspector);
  const errorText = useErrorText();
  const navigate = useNavigate();

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<DialogueMode>('dialogue');
  const [asNarrator, setAsNarrator] = useState(false);
  const [directive, setDirective] = useState('');
  const [live, setLive] = useState<LiveStream | null>(null);
  const [pending, setPending] = useState<Message[]>([]);
  const [lastMeta, setLastMeta] = useState<ContextMeta | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<unknown>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoRunRef = useRef(false);
  const [autoRunning, setAutoRunning] = useState(false);

  useEffect(() => {
    if (conv) setMode(conv.defaultMode === 'analysis' ? 'dialogue' : conv.defaultMode);
    setPending([]);
    setLastMeta(null);
    setInspected(null);
    setStreamError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conv?.id]);

  useEffect(() => () => abortRef.current?.abort(), [conversationId]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of characters ?? []) m.set(c.id, c.name);
    return m;
  }, [characters]);

  const messages = useMemo(() => {
    const base = conv?.messages ?? [];
    const ids = new Set(base.map((m) => m.id));
    return [...base, ...pending.filter((p) => !ids.has(p.id))];
  }, [conv, pending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, live?.text]);

  const generating = live !== null || autoRunning;
  const kind = conv?.kind ?? 'lab';
  const primaryName = conv?.characterId ? (names.get(conv.characterId) ?? '') : '';
  const metaFromHistory = useMemo(() => [...messages].reverse().find((m) => m.contextMeta)?.contextMeta ?? null, [messages]);
  const inspectedMeta = inspected ? (messages.find((m) => m.id === inspected)?.contextMeta ?? null) : null;
  const shownMeta = inspectedMeta ?? lastMeta ?? metaFromHistory;

  const handle = (e: StreamEvent) => {
    switch (e.type) {
      case 'author_message':
        setPending((p) => [...p, e.message]);
        break;
      case 'start':
        setLive({ messageId: e.messageId, speakerName: e.speakerName, role: e.role, text: '' });
        break;
      case 'context':
        setLastMeta(e.meta);
        setInspected(null);
        break;
      case 'delta':
        setLive((l) => (l ? { ...l, text: l.text + e.text } : l));
        break;
      case 'done':
        setPending((p) => [...p, e.message]);
        setLive(null);
        break;
      case 'error':
        if (e.message) setPending((p) => [...p, e.message!]);
        setLive(null);
        if (e.error.code !== 'aborted') setStreamError(e.error);
        break;
    }
  };

  const runStream = async (url: string, body: unknown) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamError(null);
    setLive({ messageId: null, speakerName: null, role: 'character', text: '' });
    try {
      await streamPost(url, body, handle, controller.signal);
    } catch (err) {
      setStreamError(err);
    } finally {
      setLive(null);
      await refetch();
      setPending([]);
      void invalidate('conversations', 'memories');
      // Titolo automatico ed elaborazione della memoria avvengono in background.
      setTimeout(() => void invalidate('conversations', 'conversation', 'memories'), 2500);
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || generating || !conv) return;
    setInput('');
    const role = kind !== 'lab' && asNarrator ? 'narrator' : 'author';
    // Se l'autore scrive solo per sé nelle simulazioni manuali, nessuna generazione: niente indicatore.
    if (kind === 'simulation' && conv.turnMode === 'manual') {
      // Turni manuali: il messaggio dell'autore non genera risposte.
      try {
        await streamPost(`/api/conversations/${conv.id}/messages`, { content, role, respond: false }, handle);
      } catch (err) {
        setStreamError(err);
      }
      await refetch();
      setPending([]);
      return;
    }
    await runStream(`/api/conversations/${conv.id}/messages`, { content, mode: role === 'narrator' ? 'dialogue' : mode, role });
  };

  const turn = (characterId?: string) =>
    conv && runStream(`/api/conversations/${conv.id}/turn`, { characterId, directive: directive.trim() || undefined }).then(() => setDirective(''));

  /** Più turni consecutivi scelti dalla gestione dei turni (rotazione o regia automatica). */
  const advance = async (count: number) => {
    if (!conv) return;
    autoRunRef.current = true;
    setAutoRunning(true);
    try {
      for (let i = 0; i < count && autoRunRef.current; i++) {
        await runStream(`/api/conversations/${conv.id}/turn`, {});
      }
    } finally {
      autoRunRef.current = false;
      setAutoRunning(false);
    }
  };

  const stop = () => {
    autoRunRef.current = false;
    abortRef.current?.abort();
  };

  const actions = {
    onRegenerate: (m: Message) => void runStream(`/api/messages/${m.id}/regenerate`, {}),
    onEdited: () => void refetch(),
    onDelete: async (m: Message) => {
      if (!window.confirm(t('chat.deleteConfirm'))) return;
      try {
        await api.del(`/api/messages/${m.id}`);
        await refetch();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    },
    onInspect: (m: Message) => {
      setInspected(m.id);
      if (!inspectorOpen) toggleInspector();
    },
    onRecordEvent: conv?.scenarioId
      ? async (m: Message) => {
          try {
            await api.post(`/api/scenarios/${conv.scenarioId}/events`, { content: m.content });
            toast(t('chat.eventRecorded'), 'success');
            void invalidate('scenario');
          } catch (err) {
            toast(errorText(err), 'error');
          }
        }
      : undefined,
  };

  if (isLoading) return <Spinner />;
  if (error || !conv) return <div className="p-6"><ErrorBox error={error} onRetry={() => void refetch()} /></div>;

  const participants = conv.participantIds.map((id) => ({
    id,
    name: names.get(id) ?? scenario?.participants.find((p) => p.characterId === id)?.characterName ?? id,
    role: scenario?.participants.find((p) => p.characterId === id)?.role ?? null,
  }));
  const participantNames = new Map(participants.map((p) => [p.id, p.name]));

  const placeholder =
    kind !== 'lab' && asNarrator
      ? t('chat.placeholderNarration')
      : kind === 'simulation'
        ? t('chat.placeholderSimulation')
        : mode === 'analysis'
          ? t('chat.placeholderAnalysis', { name: primaryName })
          : t('chat.placeholder', { name: primaryName });

  const chat = (
    <div className="flex h-full min-w-0 flex-col">
      {/* Intestazione */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        {renaming !== null ? (
          <form
            className="flex flex-1 gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (renaming.trim()) await api.put(`/api/conversations/${conv.id}`, { title: renaming.trim() });
              setRenaming(null);
              await refetch();
              void invalidate('conversations');
            }}
          >
            <Input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label={t('chat.rename')} />
            <Button type="submit" size="sm">
              {t('common.save')}
            </Button>
          </form>
        ) : (
          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <h2 className="min-w-0 truncate font-semibold" title={conv.title}>
              {conv.title}
            </h2>
            <IconButton label={t('chat.rename')} icon={<Pencil className="size-3.5" />} onClick={() => setRenaming(conv.title)} />
            <Badge tone={kind === 'lab' ? 'accent' : 'narration'}>{t(`enums.kind.${kind}`)}</Badge>
            {scenario && (
              <button type="button" className="truncate text-xs text-narration hover:underline" onClick={() => navigate(`/scenarios/${scenario.id}`)}>
                {scenario.title}
              </button>
            )}
            {conv.archived && <Badge>{t('enums.memoryStatus.archived')}</Badge>}
            {conv.characterId && <EngineBadge characterId={conv.characterId} />}
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            icon={<BrainCircuit className="size-3.5" />}
            loading={processing}
            disabled={generating}
            onClick={async () => {
              setProcessing(true);
              try {
                const res = await api.post<MemoryProcessingResult>(`/api/conversations/${conv.id}/process-memory`, { force: true });
                if (res.skipped) toast(t('chat.processedNothing'));
                else {
                  toast(t('chat.processed', { count: res.memoriesCreated.length }), 'success');
                  if (res.summaryCreated) toast(t('chat.processedSummary'), 'success');
                }
                await refetch();
                void invalidate('memories');
              } catch (err) {
                toast(errorText(err), 'error');
              } finally {
                setProcessing(false);
              }
            }}
          >
            {t('chat.processMemory')}
          </Button>
          <IconButton
            label={t('chat.showSuperseded')}
            icon={showSuperseded ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            onClick={() => setShowSuperseded((v) => !v)}
            className={showSuperseded ? 'text-accent' : undefined}
          />
          <IconButton
            label={conv.archived ? t('chat.unarchive') : t('chat.archive')}
            icon={conv.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            onClick={async () => {
              await api.put(`/api/conversations/${conv.id}`, { archived: !conv.archived });
              await refetch();
              void invalidate('conversations');
            }}
          />
          <IconButton
            label={t('chat.deleteConversation')}
            icon={<Trash2 className="size-4" />}
            className="hover:text-danger"
            onClick={async () => {
              if (!window.confirm(t('chat.deleteConversationConfirm'))) return;
              await api.del(`/api/conversations/${conv.id}`);
              await invalidate('conversations');
              onDeleted?.();
            }}
          />
          <IconButton label={t('chat.inspector')} icon={<PanelRight className="size-4" />} onClick={toggleInspector} className={inspectorOpen ? 'text-accent' : undefined} />
        </div>
      </div>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {messages.length === 0 && !live && (
            <p className="py-10 text-center text-sm text-muted">{kind === 'lab' ? t('chat.emptyLab', { name: primaryName }) : t('chat.emptyScene')}</p>
          )}
          {messages.map((m) => (
            <MessageItem key={m.id} message={m} actions={actions} busy={generating} selected={inspected === m.id} />
          ))}
          {live && (
            <div className="flex flex-col gap-1">
              <div className="px-1 text-xs text-muted">
                <span className={cx('font-medium', live.role === 'analysis' ? 'text-analysis' : 'text-text')}>
                  {live.role === 'analysis' ? t('chat.analysisLabel') : live.speakerName}
                </span>
              </div>
              <div
                className={cx(
                  'max-w-[min(48rem,92%)] rounded-lg border px-3.5 py-2.5',
                  live.role === 'analysis' ? 'border-dashed border-analysis/60 bg-analysis/5' : 'border-border bg-panel',
                )}
              >
                {live.text ? (
                  <RichText text={live.text} />
                ) : (
                  <span className="text-sm text-muted">{t('chat.generating', { name: live.speakerName ?? '…' })}</span>
                )}
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" aria-hidden />
              </div>
            </div>
          )}
          {streamError != null && <ErrorBox error={streamError} />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Turni (simulazioni) */}
      {kind === 'simulation' && (
        <div className="border-t border-border px-4 py-2">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
            <Select
              className="w-60"
              aria-label={t('chat.turnMode')}
              value={conv.turnMode}
              disabled={generating}
              onChange={async (e) => {
                await api.put(`/api/conversations/${conv.id}`, { turnMode: e.target.value as TurnMode });
                await refetch();
              }}
            >
              {TURN_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`enums.turnMode.${m}`)}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">{t('chat.turnOf')}:</span>
            {participants.map((p) => (
              <Button key={p.id} size="sm" disabled={generating} onClick={() => void turn(p.id)} title={p.role ?? undefined}>
                {p.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" icon={<SkipForward className="size-3.5" />} disabled={generating} onClick={() => void turn()}>
              {t('chat.nextTurn')}
            </Button>
            <Button size="sm" variant="ghost" icon={<FastForward className="size-3.5" />} disabled={generating} title={t('chat.autoTurnsHelp')} onClick={() => void advance(3)}>
              {t('chat.autoTurns', { count: 3 })}
            </Button>
            <Input className="min-w-56 flex-1" value={directive} onChange={(e) => setDirective(e.target.value)} placeholder={t('chat.directive')} aria-label={t('chat.directive')} />
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border bg-panel px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {kind !== 'simulation' && !(kind === 'scenario' && asNarrator) && (
              <Segmented
                label={t('chat.mode')}
                value={mode}
                onChange={setMode}
                options={(['dialogue', 'interview', 'analysis'] as const).map((m) => ({ id: m, label: t(`enums.mode.${m}`), title: t(`enums.modeHelp.${m}`) }))}
              />
            )}
            {kind !== 'lab' && (
              <Segmented
                label={t('chat.asAuthor')}
                value={asNarrator ? 'narrator' : 'author'}
                onChange={(v) => setAsNarrator(v === 'narrator')}
                options={[
                  { id: 'author', label: t('chat.asAuthor') },
                  { id: 'narrator', label: t('chat.asNarrator') },
                ]}
              />
            )}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              {t('chat.responseLanguage')}
              <LanguageSelect
                className="w-56"
                ariaLabel={t('chat.responseLanguage')}
                value={conv.language}
                allowAuto
                onChange={async (v) => {
                  await api.put(`/api/conversations/${conv.id}`, { language: v ?? 'auto' });
                  await refetch();
                }}
              />
            </label>
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              autoGrow
              rows={2}
              value={input}
              placeholder={placeholder}
              aria-label={placeholder}
              className={cx('flex-1', mode === 'analysis' && kind !== 'simulation' && !asNarrator && 'border-analysis/60')}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {generating ? (
              <Button variant="danger" icon={<Square className="size-3.5" />} onClick={stop}>
                {t('chat.stop')}
              </Button>
            ) : (
              <Button variant="primary" icon={<Send className="size-3.5" />} disabled={!input.trim()} onClick={() => void send()}>
                {t('chat.send')}
              </Button>
            )}
          </div>
          <p className="flex justify-between gap-2 text-[11px] text-muted">
            <span>{t('chat.generatedNote')}</span>
            <span>{t('chat.sendHint')}</span>
          </p>
        </div>
      </div>
    </div>
  );

  if (!inspectorOpen) return chat;
  return (
    <PanelGroup direction="horizontal" autoSaveId="persona-chat-panels" className="h-full">
      <Panel defaultSize={68} minSize={40}>
        {chat}
      </Panel>
      <PanelResizeHandle className="w-1 bg-border transition-colors hover:bg-accent/60" />
      <Panel defaultSize={32} minSize={20} className="border-l border-border">
        <Inspector conversation={conv} scenario={scenario ?? null} meta={shownMeta} participantNames={participantNames} />
      </Panel>
    </PanelGroup>
  );
}
