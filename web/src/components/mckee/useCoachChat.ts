/**
 * Conversazione in streaming con il coach McKee, condivisa dal pannello del coach e
 * dall'assistente di costruzione (modalità `guide`): fili, messaggi, streaming SSE,
 * stato delle proposte.
 */
import type { CoachMessage, CoachMode, CoachProposal, CoachStreamEvent } from '@persona/shared/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, streamPost } from '../../api/client';
import { qk, useCoachThread, useCoachThreads } from '../../api/hooks';

export interface CoachSendOptions {
  transcriptConversationId?: string | null;
  newThread?: boolean;
}

export function useCoachChat({
  characterId,
  mode,
  body,
  onDone,
}: {
  characterId: string;
  mode: CoachMode;
  /** Dati del turno (bozza, progetto, tappa…), letti al momento dell'invio. */
  body(): Record<string, unknown>;
  /** Risposta completata (es. applicazione automatica delle proposte nella modalità guidata). */
  onDone?(message: CoachMessage): void;
}) {
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: threads } = useCoachThreads(characterId, mode);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false);
  const { data: thread } = useCoachThread(threadId);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [streaming, setStreaming] = useState<{ text: string; reasoning: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Primo accesso: l'ultima conversazione di questa modalità.
  useEffect(() => {
    if (!chosen && threadId === null && threads?.length) setThreadId(threads[0].id);
  }, [threads, threadId, chosen]);
  useEffect(() => {
    if (thread && !streaming) setMessages(thread.messages);
  }, [thread, streaming]);

  const refresh = async (tid: string | null) => {
    if (tid) await qc.invalidateQueries({ queryKey: qk.coachThread(tid) });
    await qc.invalidateQueries({ queryKey: qk.coachThreads(characterId) });
  };

  const send = async (content: string, opts: CoachSendOptions = {}) => {
    const text = content.trim();
    if (!text || streaming) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming({ text: '', reasoning: '' });
    let tid = opts.newThread ? null : threadId;
    if (opts.newThread) setMessages([]);
    try {
      await streamPost<CoachStreamEvent>(
        `/api/characters/${characterId}/coach`,
        { ...body(), mode, threadId: tid, content: text, uiLanguage: i18n.language, transcriptConversationId: opts.transcriptConversationId ?? null },
        (e) => {
          switch (e.type) {
            case 'thread':
              tid = e.thread.id;
              setThreadId(e.thread.id);
              setChosen(true);
              break;
            case 'author_message':
              setMessages((ms) => [...ms, e.message]);
              break;
            case 'delta':
              setStreaming((s) => (s ? { ...s, text: s.text + e.text } : s));
              break;
            case 'reasoning':
              setStreaming((s) => (s ? { ...s, reasoning: s.reasoning + e.text } : s));
              break;
            case 'done':
              setMessages((ms) => [...ms, e.message]);
              onDoneRef.current?.(e.message);
              break;
            case 'error':
              if (e.message) setMessages((ms) => [...ms, e.message!]);
              if (e.error.code !== 'aborted') setError(e.error);
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      setError(err);
    } finally {
      setStreaming(null);
      abortRef.current = null;
      await refresh(tid);
    }
  };

  const setProposalStatus = async (messageId: string, proposal: Pick<CoachProposal, 'id'>, status: CoachProposal['status']) => {
    const updated = await api.put<CoachMessage>(`/api/coach/messages/${messageId}/proposals/${proposal.id}`, { status });
    setMessages((ms) => ms.map((x) => (x.id === messageId ? updated : x)));
    if (threadId) await qc.invalidateQueries({ queryKey: qk.coachThread(threadId) });
    return updated;
  };

  const selectThread = (id: string | null) => {
    setChosen(true);
    setThreadId(id);
    if (!id) setMessages([]);
  };

  const removeThread = async () => {
    if (!threadId) return;
    await api.del(`/api/coach/threads/${threadId}`);
    selectThread(null);
    await refresh(null);
  };

  return {
    threads: threads ?? [],
    threadId,
    selectThread,
    messages,
    streaming,
    error,
    send,
    stop: () => abortRef.current?.abort(),
    setProposalStatus,
    removeThread,
  };
}
