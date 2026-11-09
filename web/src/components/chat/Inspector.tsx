import type { ContextMeta, ContextPreview, ConversationDetail, Memory, ScenarioDetail } from '@persona/shared/client';
import { estimateTokens } from '@persona/shared/client';
import { ExternalLink, FileSearch } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { useCharacter, useMemories } from '../../api/hooks';
import { formatDateTime, formatNumber, languageLabel } from '../../lib/format';
import { Badge, Button, ErrorBox, Modal, Select, Spinner, Tabs, useErrorText } from '../ui';

type Tab = 'context' | 'profile' | 'memories' | 'summaries';

export function categoryTone(c: Memory['category']) {
  return c === 'core' ? 'accent' : c === 'contextual' ? 'narration' : c === 'episodic' ? 'ok' : 'neutral';
}

export function Inspector({
  conversation,
  scenario,
  meta,
  participantNames,
}: {
  conversation: ConversationDetail;
  scenario: ScenarioDetail | null;
  meta: ContextMeta | null;
  participantNames: Map<string, string>;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('context');
  const [focusId, setFocusId] = useState<string>(conversation.characterId ?? conversation.participantIds[0] ?? '');
  const ids = conversation.participantIds;
  return (
    <div className="flex h-full flex-col bg-panel">
      <Tabs
        className="px-2"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'context', label: t('inspector.tabs.context') },
          { id: 'profile', label: conversation.kind === 'simulation' ? t('inspector.tabs.participants') : t('inspector.tabs.profile') },
          { id: 'memories', label: t('inspector.tabs.memories') },
          { id: 'summaries', label: t('inspector.tabs.summaries'), badge: conversation.summaries.length ? <Badge>{conversation.summaries.length}</Badge> : undefined },
        ]}
      />
      {ids.length > 1 && (tab === 'memories' || tab === 'context') && (
        <div className="border-b border-border px-3 py-2">
          <Select value={focusId} onChange={(e) => setFocusId(e.target.value)} aria-label={t('inspector.speaker')}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {participantNames.get(id) ?? id}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3 text-sm">
        {tab === 'context' && <ContextTab conversation={conversation} meta={meta} speakerId={focusId} />}
        {tab === 'profile' &&
          (conversation.kind === 'simulation' ? (
            <div className="flex flex-col gap-4">
              {ids.map((id) => (
                <ProfileCard key={id} characterId={id} scenario={scenario} />
              ))}
            </div>
          ) : (
            <ProfileCard characterId={conversation.characterId!} scenario={scenario} />
          ))}
        {tab === 'memories' && <MemoriesTab characterId={focusId} scenarioId={conversation.scenarioId} />}
        {tab === 'summaries' && (
          <div className="flex flex-col gap-3">
            {conversation.summaries.length === 0 && <p className="text-muted">{t('inspector.noSummaries')}</p>}
            {[...conversation.summaries].reverse().map((s) => (
              <div key={s.id} className="rounded border border-border p-2">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>{t('inspector.summaryRange', { from: s.fromSeq, to: s.toSeq })}</span>
                  <span>{formatDateTime(s.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap">{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContextTab({ conversation, meta, speakerId }: { conversation: ConversationDetail; meta: ContextMeta | null; speakerId: string }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const errorText = useErrorText();
  const max = meta ? Math.max(...meta.sections.map((s) => s.tokens), 1) : 1;

  return (
    <div className="flex flex-col gap-3">
      <Button
        icon={<FileSearch className="size-4" />}
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            setPreview(await api.post<ContextPreview>(`/api/conversations/${conversation.id}/context-preview`, { characterId: speakerId || undefined }));
          } catch (err) {
            setError(err);
          } finally {
            setLoading(false);
          }
        }}
      >
        {t('inspector.fullPrompt')}
      </Button>
      {error != null && <ErrorBox error={error} />}
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t('inspector.lastContext')}</h3>
      {!meta && <p className="text-muted">{t('inspector.noContext')}</p>}
      {meta && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">{t('inspector.model')}</dt>
            <dd className="font-mono break-all">
              {meta.model} <span className="text-muted">({t(`enums.provider.${meta.providerType}`)})</span>
            </dd>
            <dt className="text-muted">{t('inspector.promptTokens')}</dt>
            <dd className="font-mono">
              {formatNumber(meta.promptTokens)} — {t('inspector.budget', { context: formatNumber(meta.contextLength), output: formatNumber(meta.maxOutputTokens) })}
            </dd>
            <dt className="text-muted">{t('inspector.responseLanguage')}</dt>
            <dd>{meta.responseLanguage === 'auto' ? t('chat.languageAuto') : languageLabel(meta.responseLanguage)}</dd>
            <dt className="text-muted">{t('chat.mode')}</dt>
            <dd>{t(`enums.mode.${meta.mode}`)}</dd>
          </dl>
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted">{t('inspector.sections')}</h4>
            <ul className="flex flex-col gap-0.5">
              {meta.sections.map((s) => (
                <li key={s.key} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-xs">
                  <span className="truncate">{t(`inspector.sectionLabels.${s.key}`, { defaultValue: s.key })}</span>
                  <span className="h-1.5 rounded bg-panel-2">
                    <span className="block h-1.5 rounded bg-accent/70" style={{ width: `${Math.max(3, (s.tokens / max) * 100)}%` }} />
                  </span>
                  <span className="text-right font-mono text-muted">{formatNumber(s.tokens)}</span>
                </li>
              ))}
            </ul>
          </div>
          {meta.retrieval && (
            <p className="text-xs text-muted">
              {meta.retrieval.mode === 'hybrid' ? t('inspector.retrievalHybrid', { model: meta.retrieval.embeddingModel }) : t('inspector.retrievalLexical')}
              {meta.retrieval.semanticError && <span className="block text-warn">{t('inspector.semanticError', { error: meta.retrieval.semanticError })}</span>}
            </p>
          )}
          {meta.turnSelection && (
            <p className="text-xs">
              <span className="text-muted">{t('inspector.turnSelection')}:</span> {t(`enums.turnMode.${meta.turnSelection.mode}`)}
              {meta.turnSelection.reason && <span className="text-muted"> — {meta.turnSelection.reason}</span>}
            </p>
          )}
          <p className="text-xs text-muted">
            {t('inspector.history', { included: meta.historyIncluded, omitted: meta.historyOmitted })}
            {meta.summaryId && <> · {t('inspector.summaryUsed')}</>}
          </p>
          {meta.directive && (
            <p className="text-xs">
              <span className="text-muted">{t('inspector.directive')}:</span> {meta.directive}
            </p>
          )}
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted">{t('inspector.memoriesUsed', { count: meta.memories.length })}</h4>
            <ul className="flex flex-col gap-1">
              {meta.memories.map((m) => (
                <li key={m.id} className="flex gap-1.5 text-xs">
                  <Badge tone={categoryTone(m.category)}>{t(`enums.memoryCategory.${m.category}`)}</Badge>
                  <span className="flex-1">{m.preview}</span>
                  <span className="font-mono text-muted" title={m.semantic !== undefined ? `${t('memory.semantic')}: ${m.semantic.toFixed(2)}` : undefined}>
                    {m.score.toFixed(2)}
                    {m.semantic !== undefined && <span className="text-accent"> ·{m.semantic.toFixed(2)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {meta.knowledge.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium text-muted">{t('inspector.knowledgeUsed', { count: meta.knowledge.length })}</h4>
              <ul className="flex flex-col gap-0.5 text-xs">
                {meta.knowledge.map((k) => (
                  <li key={k.chunkId}>
                    {k.title} <span className="font-mono text-muted">{k.score.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meta.excerpts.length > 0 && <p className="text-xs text-muted">{t('inspector.excerptsUsed', { count: meta.excerpts.length })}</p>}
        </>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t('inspector.fullPrompt')} wide>
        <p className="mb-3 text-xs text-muted">{t('inspector.fullPromptHelp')}</p>
        {preview && (
          <ol className="flex flex-col gap-3">
            {preview.messages.map((m, i) => (
              <li key={i} className="rounded border border-border">
                <div className="flex justify-between border-b border-border bg-panel-2 px-2 py-1 font-mono text-xs text-muted">
                  <span>{m.role}</span>
                  <span>~{formatNumber(estimateTokens(m.content))} tok</span>
                </div>
                <pre className="max-h-[50vh] overflow-auto p-2 font-mono text-xs whitespace-pre-wrap">{m.content}</pre>
              </li>
            ))}
          </ol>
        )}
        {error != null && <p className="text-danger">{errorText(error)}</p>}
      </Modal>
    </div>
  );
}

function ProfileCard({ characterId, scenario }: { characterId: string; scenario: ScenarioDetail | null }) {
  const { t } = useTranslation();
  const { data: c, isLoading } = useCharacter(characterId);
  if (isLoading || !c) return <Spinner />;
  const part = scenario?.participants.find((p) => p.characterId === characterId);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{c.name}</div>
          <div className="text-xs text-muted">{[c.occupation, c.age, c.origin].filter(Boolean).join(' · ')}</div>
        </div>
        <Link to={`/characters/${c.id}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          {t('inspector.openProfile')} <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>
      {part && (
        <div className="rounded border border-narration/40 bg-narration/5 p-2 text-xs">
          <div className="font-medium text-narration">{part.role ?? '—'}</div>
          {part.roleDescription && <p className="mt-0.5">{part.roleDescription}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {c.languages.map((l) => (
          <Badge key={l.code} tone={l.isNative ? 'accent' : 'neutral'}>
            {languageLabel(l.code)} · {t(`enums.proficiency.${l.isNative ? 'native' : l.proficiency}`)}
          </Badge>
        ))}
      </div>
      {c.expertise.length > 0 && (
        <ul className="text-xs">
          {c.expertise.map((e, i) => (
            <li key={i}>
              <span className="font-medium">{e.domain}</span> <span className="text-muted">({t(`enums.expertiseLevel.${e.level}`)})</span>
            </li>
          ))}
        </ul>
      )}
      {c.traits.filter((x) => x.category === 'personality').length > 0 && (
        <p className="text-xs text-muted">
          {c.traits
            .filter((x) => x.category === 'personality')
            .map((x) => x.content)
            .join(' · ')}
        </p>
      )}
      {c.temperament && <p className="text-xs">{c.temperament}</p>}
    </div>
  );
}

function MemoriesTab({ characterId, scenarioId }: { characterId: string; scenarioId: string | null }) {
  const { t } = useTranslation();
  const { data, isLoading } = useMemories({ characterId, status: 'active' }, !!characterId);
  const inScope = (data ?? []).filter((m) =>
    scenarioId == null ? m.category !== 'contextual' : m.category === 'core' || m.category === 'semantic' || m.scenarioId === scenarioId,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{t('inspector.memoriesInScope')}</span>
        <Link to={`/memory?characterId=${characterId}`} className="text-accent hover:underline">
          {t('inspector.manageMemories')}
        </Link>
      </div>
      {isLoading && <Spinner />}
      {inScope.length === 0 && !isLoading && <p className="text-muted">{t('memory.empty')}</p>}
      <ul className="flex flex-col gap-1.5">
        {inScope.map((m) => (
          <li key={m.id} className="rounded border border-border p-2 text-xs">
            <div className="mb-1 flex flex-wrap gap-1">
              <Badge tone={categoryTone(m.category)}>{t(`enums.memoryCategory.${m.category}`)}</Badge>
              <Badge>{t(`enums.epistemic.${m.epistemicStatus}`)}</Badge>
              <span className="text-muted">★ {m.importance}</span>
            </div>
            {m.content}
          </li>
        ))}
      </ul>
    </div>
  );
}
