import type { Conversation } from '@persona/shared/client';
import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { useCharacters, useConversations, useInvalidate } from '../api/hooks';
import { ChatWorkspace } from '../components/chat/ChatWorkspace';
import { Button, Checkbox, cx, EmptyState, Select, Spinner, useErrorText } from '../components/ui';
import { formatRelative } from '../lib/format';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';

export function ConversationList({
  conversations,
  activeId,
  hrefFor,
}: {
  conversations: Conversation[] | undefined;
  activeId?: string;
  hrefFor(c: Conversation): string;
}) {
  const { t } = useTranslation();
  if (!conversations) return <Spinner />;
  if (conversations.length === 0) return <p className="p-3 text-sm text-muted">{t('dialogue.noConversations')}</p>;
  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            to={hrefFor(c)}
            className={cx('block rounded-md px-2.5 py-1.5', c.id === activeId ? 'bg-accent-soft text-text' : 'text-muted hover:bg-panel-2 hover:text-text')}
          >
            <div className="truncate text-sm">{c.title}</div>
            <div className="text-[11px] opacity-80">
              {t('dialogue.messages', { count: c.messageCount })} · {formatRelative(c.lastMessageAt ?? c.updatedAt)}
              {c.archived && ` · ${t('enums.memoryStatus.archived')}`}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DialoguePage() {
  const { characterId, conversationId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId, project } = useActiveProject();
  const { data: characters, isLoading } = useCharacters('active', projectId);
  const [showArchived, setShowArchived] = useState(false);
  const { data: conversations } = useConversations({ characterId, kind: 'lab', archived: showArchived ? '1' : undefined }, !!characterId);
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();

  // Ripristino della sessione: riapre l'ultima conversazione usata con il personaggio.
  useEffect(() => {
    if (!characterId) return;
    const key = `persona.lastConversation.${characterId}`;
    try {
      if (conversationId) localStorage.setItem(key, conversationId);
      else if (conversations) {
        const last = localStorage.getItem(key);
        if (last && conversations.some((c) => c.id === last)) navigate(`/dialogue/${characterId}/${last}`, { replace: true });
      }
    } catch {
      /* localStorage non disponibile */
    }
  }, [characterId, conversationId, conversations, navigate]);

  const create = async () => {
    if (!characterId) return;
    try {
      const conv = await api.post<Conversation>('/api/conversations', { kind: 'lab', characterId });
      await invalidate('conversations');
      navigate(`/dialogue/${characterId}/${conv.id}`);
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border p-3">
          <h1 className="mb-0.5 text-sm font-semibold">{t('dialogue.title')}</h1>
          <p className="mb-2 text-xs text-muted">{t('dialogue.subtitle')}</p>
          {isLoading ? (
            <Spinner />
          ) : (
            <Select value={characterId ?? ''} onChange={(e) => navigate(e.target.value ? `/dialogue/${e.target.value}` : '/dialogue')} aria-label={t('dialogue.selectCharacter')}>
              <option value="">{t('dialogue.selectCharacter')}</option>
              {characters?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        {characterId && (
          <>
            <div className="flex items-center justify-between px-3 pt-3">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">{t('dialogue.conversations')}</span>
            </div>
            <div className="px-3 pt-2">
              <Button className="w-full" icon={<MessageSquarePlus className="size-4" />} onClick={() => void create()}>
                {t('dialogue.newConversation')}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList conversations={conversations} activeId={conversationId} hrefFor={(c) => `/dialogue/${characterId}/${c.id}`} />
            </div>
            <div className="border-t border-border p-3">
              <Checkbox label={t('dialogue.showArchived')} checked={showArchived} onChange={setShowArchived} />
            </div>
          </>
        )}
      </aside>
      <section className="min-w-0 flex-1">
        {!characterId ? (
          <div className="p-6">
            <EmptyState>{characters?.length === 0 ? (project ? t('characters.emptyProject') : t('dialogue.noCharacters')) : t('dialogue.selectCharacter')}</EmptyState>
          </div>
        ) : conversationId ? (
          <ChatWorkspace key={conversationId} conversationId={conversationId} onDeleted={() => navigate(`/dialogue/${characterId}`)} />
        ) : (
          <div className="p-6">
            <EmptyState
              action={
                <Button variant="primary" icon={<MessageSquarePlus className="size-4" />} onClick={() => void create()}>
                  {t('dialogue.newConversation')}
                </Button>
              }
            >
              {t('dialogue.selectConversation')}
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}
