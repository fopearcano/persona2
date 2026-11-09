import type { Message, MessageRevision } from '@persona/shared/client';
import { AlertTriangle, Brain, CalendarPlus, Check, Copy, History, Pencil, RefreshCw, ScanSearch, Trash2 } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { formatDateTime, languageLabel } from '../../lib/format';
import { Badge, Button, cx, IconButton, Modal, Textarea } from '../ui';

/** Rendering sicuro di un markdown minimo (*corsivo*, **grassetto**, `codice`): nessun HTML iniettato. */
export function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="prose-msg">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {inline(p)}
        </p>
      ))}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else out.push(<code key={k++} className="rounded bg-panel-2 px-1 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return out;
}

export interface MessageActions {
  onRegenerate(m: Message): void;
  onEdited(): void;
  onDelete(m: Message): void;
  onInspect(m: Message): void;
  /** Solo negli scenari: registra una narrazione come evento noto dello scenario. */
  onRecordEvent?(m: Message): void;
}

export function MessageItem({ message: m, actions, busy, selected }: { message: Message; actions: MessageActions; busy: boolean; selected: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [copied, setCopied] = useState(false);
  const [revisions, setRevisions] = useState<MessageRevision[] | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  const isAuthor = m.role === 'author';
  const isNarrator = m.role === 'narrator';
  const isAnalysis = m.role === 'analysis';
  const generated = m.role === 'character' || isAnalysis;
  const superseded = m.status === 'superseded';

  const label = isAuthor ? t('chat.authorLabel') : isNarrator ? t('chat.narratorLabel') : isAnalysis ? t('chat.analysisLabel') : m.speakerName;

  const bubble = cx(
    'group relative max-w-[min(48rem,92%)] rounded-lg border px-3.5 py-2.5 text-[14px] leading-relaxed',
    isAuthor && 'ml-auto border-border bg-panel-2',
    m.role === 'character' && 'border-border bg-panel',
    isAnalysis && 'border-dashed border-analysis/60 bg-analysis/5',
    isNarrator && 'mx-auto border-narration/40 bg-narration/5 italic',
    superseded && 'opacity-55',
    selected && 'ring-1 ring-accent',
  );

  return (
    <div className={cx('flex flex-col gap-1', isAuthor && 'items-end', isNarrator && 'items-center')}>
      <div className={cx('flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted', isAuthor && 'justify-end')}>
        <span className={cx('font-medium', isAnalysis ? 'text-analysis' : isNarrator ? 'text-narration' : 'text-text')}>{label}</span>
        {m.mode === 'interview' && !isNarrator && <Badge>{t('enums.mode.interview')}</Badge>}
        {isAuthor && m.mode === 'analysis' && <Badge tone="analysis">{t('enums.mode.analysis')}</Badge>}
        {m.language && m.language !== 'auto' && generated && <Badge title={t('chat.responseLanguage')}>{languageLabel(m.language)}</Badge>}
        {m.model && <span className="font-mono text-[11px]">{m.model}</span>}
        <span title={formatDateTime(m.createdAt)}>{formatDateTime(m.createdAt)}</span>
        {m.editedAt && <span>· {t('chat.edited')}</span>}
        {superseded && <Badge>{t('chat.superseded')}</Badge>}
      </div>
      <div className={bubble}>
        {editing ? (
          <div className="flex min-w-[24rem] flex-col gap-2">
            <Textarea autoFocus rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('chat.edit')} />
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => (setEditing(false), setDraft(m.content))}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft.trim()}
                onClick={async () => {
                  await api.put(`/api/messages/${m.id}`, { content: draft });
                  setEditing(false);
                  actions.onEdited();
                }}
              >
                {t('chat.saveEdit')}
              </Button>
            </div>
          </div>
        ) : m.content ? (
          <RichText text={m.content} />
        ) : null}
        {m.status === 'incomplete' && (
          <p className="mt-1 flex items-center gap-1 text-xs text-warn">
            <AlertTriangle className="size-3.5" aria-hidden /> {t('chat.incomplete')}
          </p>
        )}
        {m.status === 'error' && (
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="size-4" aria-hidden /> {t('chat.failed')}
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} disabled={busy} onClick={() => actions.onRegenerate(m)}>
              {t('chat.retry')}
            </Button>
          </div>
        )}
        {m.reasoning && (
          <div className="mt-2 border-t border-border pt-1.5">
            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text" onClick={() => setShowReasoning((v) => !v)}>
              <Brain className="size-3.5" aria-hidden /> {t('chat.reasoning')}
            </button>
            {showReasoning && <p className="mt-1 text-xs whitespace-pre-wrap text-muted">{m.reasoning}</p>}
          </div>
        )}

        {!editing && !superseded && (
          <div
            className={cx(
              'absolute -top-3 flex rounded-md border border-border bg-panel opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100',
              isAuthor ? 'left-2' : 'right-2',
            )}
          >
            <IconButton
              label={copied ? t('common.copied') : t('chat.copy')}
              icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              onClick={async () => {
                await navigator.clipboard?.writeText(m.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            />
            {m.status !== 'error' && <IconButton label={t('chat.edit')} icon={<Pencil className="size-3.5" />} disabled={busy} onClick={() => setEditing(true)} />}
            {generated && <IconButton label={t('chat.regenerate')} icon={<RefreshCw className="size-3.5" />} disabled={busy} onClick={() => actions.onRegenerate(m)} />}
            {m.contextMeta && <IconButton label={t('chat.showContext')} icon={<ScanSearch className="size-3.5" />} onClick={() => actions.onInspect(m)} />}
            {isNarrator && actions.onRecordEvent && (
              <IconButton label={t('chat.recordEvent')} icon={<CalendarPlus className="size-3.5" />} onClick={() => actions.onRecordEvent?.(m)} />
            )}
            {m.editedAt && (
              <IconButton
                label={t('chat.revisions')}
                icon={<History className="size-3.5" />}
                onClick={async () => setRevisions(await api.get<MessageRevision[]>(`/api/messages/${m.id}/revisions`))}
              />
            )}
            <IconButton label={t('chat.delete')} icon={<Trash2 className="size-3.5" />} disabled={busy} className="hover:text-danger" onClick={() => actions.onDelete(m)} />
          </div>
        )}
      </div>
      <Modal open={revisions !== null} onClose={() => setRevisions(null)} title={t('chat.revisions')}>
        {revisions?.length === 0 && <p className="text-sm text-muted">{t('chat.noRevisions')}</p>}
        <ul className="flex flex-col gap-3">
          {revisions?.map((r) => (
            <li key={r.id} className="rounded border border-border p-2">
              <div className="mb-1 text-xs text-muted">{formatDateTime(r.createdAt)}</div>
              <p className="text-sm whitespace-pre-wrap">{r.content}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
