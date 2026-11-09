import type { EpistemicStatus, Memory } from '@persona/shared/client';
import { EPISTEMIC_STATUSES } from '@persona/shared/client';
import { Archive, ArchiveRestore, ArrowUpCircle, Check, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../api/client';
import { formatDateTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { categoryTone } from './chat/Inspector';
import { Badge, Button, IconButton, Select, Textarea, useErrorText } from './ui';

/** Riga di memoria con modifica, approvazione, promozione esplicita e provenienza. */
export function MemoryRow({
  memory: m,
  scenarioTitle,
  characterName,
  onChanged,
}: {
  memory: Memory;
  scenarioTitle?: string | null;
  characterName?: string;
  onChanged(): void;
}) {
  const { t } = useTranslation();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ content: m.content, importance: m.importance, epistemicStatus: m.epistemicStatus });

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok, 'success');
      onChanged();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const promote = (target: 'semantic' | 'core') => {
    if (!window.confirm(t('memory.promoteConfirm'))) return;
    void act(() => api.post(`/api/memories/${m.id}/promote`, { targetCategory: target }), t('memory.promoted'));
  };

  return (
    <li className="rounded-lg border border-border bg-panel p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={categoryTone(m.category)} title={t(`enums.memoryCategoryHelp.${m.category}`)}>
          {t(`enums.memoryCategory.${m.category}`)}
        </Badge>
        {m.category === 'contextual' && scenarioTitle && <Badge tone="narration">{scenarioTitle}</Badge>}
        <Badge tone={m.epistemicStatus === 'fiction' ? 'narration' : m.epistemicStatus === 'fact' ? 'ok' : 'warn'}>{t(`enums.epistemic.${m.epistemicStatus}`)}</Badge>
        {m.status !== 'active' && <Badge tone={m.status === 'proposed' ? 'warn' : 'neutral'}>{t(`enums.memoryStatus.${m.status}`)}</Badge>}
        {m.pinned && (
          <Badge tone="accent">
            <Pin className="size-3" aria-hidden /> {t('memory.pinned')}
          </Badge>
        )}
        <span className="text-xs text-muted" title={t('memory.importance')}>
          {'★'.repeat(m.importance)}
          <span className="opacity-30">{'★'.repeat(5 - m.importance)}</span>
        </span>
        {characterName && <span className="text-xs text-muted">· {characterName}</span>}
        <div className="ml-auto flex items-center">
          {m.status === 'proposed' && (
            <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => void act(() => api.post(`/api/memories/${m.id}/approve`), t('memory.approved'))}>
              {t('memory.approve')}
            </Button>
          )}
          <IconButton label={t('common.edit')} icon={<Pencil className="size-3.5" />} onClick={() => setEditing((v) => !v)} />
          <IconButton
            label={m.pinned ? t('memory.unpin') : t('memory.pin')}
            icon={m.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            onClick={() => void act(() => api.put(`/api/memories/${m.id}`, { pinned: !m.pinned }))}
          />
          {m.status === 'archived' ? (
            <IconButton label={t('memory.restore')} icon={<ArchiveRestore className="size-3.5" />} onClick={() => void act(() => api.put(`/api/memories/${m.id}`, { status: 'active' }))} />
          ) : (
            <IconButton label={t('memory.archiveMemory')} icon={<Archive className="size-3.5" />} onClick={() => void act(() => api.put(`/api/memories/${m.id}`, { status: 'archived' }))} />
          )}
          <IconButton
            label={t('common.delete')}
            icon={<Trash2 className="size-3.5" />}
            className="hover:text-danger"
            onClick={() => window.confirm(t('memory.deleteConfirm')) && void act(() => api.del(`/api/memories/${m.id}`), t('toast.deleted'))}
          />
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea rows={3} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} aria-label={t('memory.content')} />
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-40" value={draft.importance} onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })} aria-label={t('memory.importance')}>
              {[1, 2, 3, 4, 5].map((i) => (
                <option key={i} value={i}>
                  {t('memory.importance')}: {i}
                </option>
              ))}
            </Select>
            <Select className="w-48" value={draft.epistemicStatus} onChange={(e) => setDraft({ ...draft, epistemicStatus: e.target.value as EpistemicStatus })} aria-label={t('memory.epistemic')}>
              {EPISTEMIC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`enums.epistemic.${s}`)}
                </option>
              ))}
            </Select>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft.content.trim()}
                onClick={() => void act(() => api.put(`/api/memories/${m.id}`, draft), t('toast.saved')).then(() => setEditing(false))}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="font-text text-sm whitespace-pre-wrap">{m.content}</p>
      )}

      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none">
          {t('memory.provenance')} · {t(`enums.memoryOrigin.${m.origin}`)} · {formatDateTime(m.createdAt)} · {t('memory.retrieved', { count: m.retrievalCount })}
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5 pl-3">
          {m.promotedFromId && <li>{t('memory.promotedFrom')} ({m.promotedFromId.slice(0, 8)})</li>}
          {m.sources.map((s) => (
            <li key={s.id}>
              {s.note}
              {s.fromSeq != null && <> · {t('memory.seqRange', { from: s.fromSeq, to: s.toSeq })}</>}
              {s.conversationId && (
                <>
                  {' '}
                  ·{' '}
                  <Link className="text-accent hover:underline" to={s.scenarioId ? `/scenarios/${s.scenarioId}/sessions/${s.conversationId}` : `/dialogue/${m.characterId}/${s.conversationId}`}>
                    {t('memory.openConversation')}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>

      {(m.category === 'contextual' || m.category === 'episodic' || m.category === 'semantic') && m.status !== 'archived' && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <ArrowUpCircle className="size-3.5 text-muted" aria-hidden />
          <span className="text-xs text-muted">{t('memory.promote')}:</span>
          {m.category === 'contextual' && (
            <Button size="sm" variant="ghost" onClick={() => promote('semantic')}>
              {t('memory.promoteSemantic')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => promote('core')}>
            {t('memory.promoteCore')}
          </Button>
        </div>
      )}
    </li>
  );
}
