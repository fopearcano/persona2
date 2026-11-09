import type { EpistemicStatus, MemoryCategory, MemoryConsistencyReport, MemoryStatus } from '@persona/shared/client';
import { EPISTEMIC_STATUSES, MEMORY_CATEGORIES, MEMORY_STATUSES } from '@persona/shared/client';
import { Plus, ScanSearch, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { api } from '../api/client';
import { useCharacters, useMemories, useScenarios } from '../api/hooks';
import { categoryTone } from '../components/chat/Inspector';
import { MemoryRow } from '../components/MemoryRow';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea, useErrorText } from '../components/ui';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';

type CatTab = 'all' | MemoryCategory | 'proposed';

interface RetrievedRow {
  id: string;
  category: MemoryCategory;
  content: string;
  score?: number;
  semantic?: number;
  importance: number;
}

export function MemoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const characterId = params.get('characterId') ?? '';
  const [tab, setTab] = useState<CatTab>('all');
  const [scenarioId, setScenarioId] = useState('');
  const [status, setStatus] = useState<MemoryStatus | ''>('');
  const [q, setQ] = useState('');
  const { projectId } = useActiveProject();
  const { data: characters } = useCharacters();
  const { data: scenarios } = useScenarios();
  // Il selettore mostra i personaggi del progetto attivo (più quello aperto da un link, se esterno).
  const pickable = (characters ?? []).filter((c) => !projectId || c.projectIds.includes(projectId) || c.id === characterId);
  const filters = {
    characterId,
    category: tab === 'all' || tab === 'proposed' ? undefined : tab,
    status: tab === 'proposed' ? 'proposed' : status || undefined,
    scenarioId: scenarioId || undefined,
    q: q.trim() || undefined,
  };
  const { data, isLoading, error, refetch } = useMemories(filters, !!characterId);
  const { data: proposed } = useMemories({ characterId, status: 'proposed' }, !!characterId);
  const scenarioTitles = useMemo(() => new Map((scenarios ?? []).map((s) => [s.id, s.title])), [scenarios]);
  const characterScenarios = (scenarios ?? []).filter((s) => {
    const name = characters?.find((c) => c.id === characterId)?.name;
    return name && s.participantNames.includes(name) && (!projectId || s.projectId === projectId);
  });

  return (
    <div>
      <PageHeader
        title={t('memory.title')}
        subtitle={t('memory.subtitle')}
        actions={
          <Select
            className="w-64"
            value={characterId}
            aria-label={t('memory.selectCharacter')}
            onChange={(e) => setParams(e.target.value ? { characterId: e.target.value } : {})}
          >
            <option value="">{t('memory.selectCharacter')}</option>
            {pickable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        }
      />
      {!characterId ? (
        <div className="p-6">
          <EmptyState>{t('memory.selectCharacter')}</EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-6 py-4 xl:grid-cols-[1fr_22rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'all', label: t('memory.all') },
                ...MEMORY_CATEGORIES.map((c) => ({ id: c as CatTab, label: t(`enums.memoryCategory.${c}`) })),
                { id: 'proposed', label: t('memory.proposed'), badge: proposed?.length ? <Badge tone="warn">{proposed.length}</Badge> : undefined },
              ]}
            />
            {tab !== 'all' && tab !== 'proposed' && <p className="text-xs text-muted">{t(`enums.memoryCategoryHelp.${tab}`)}</p>}
            {tab === 'proposed' && <p className="text-xs text-muted">{t('memory.proposedHelp')}</p>}
            <div className="flex flex-wrap gap-2">
              <Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('memory.searchPlaceholder')} aria-label={t('common.search')} />
              {(tab === 'contextual' || tab === 'all') && (
                <Select className="w-56" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} aria-label={t('memory.scenario')}>
                  <option value="">{t('memory.allScenarios')}</option>
                  {characterScenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              )}
              {tab !== 'proposed' && (
                <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value as MemoryStatus | '')} aria-label={t('memory.statusFilter')}>
                  <option value="">{t('memory.anyStatus')}</option>
                  {MEMORY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`enums.memoryStatus.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {isLoading && <Spinner />}
            {error && <ErrorBox error={error} />}
            {data?.length === 0 && <EmptyState>{t('memory.empty')}</EmptyState>}
            <ul className="flex flex-col gap-2">
              {data?.map((m) => (
                <MemoryRow key={m.id} memory={m} scenarioTitle={m.scenarioId ? scenarioTitles.get(m.scenarioId) : null} onChanged={() => void refetch()} />
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <NewMemoryCard characterId={characterId} scenarios={characterScenarios} onCreated={() => void refetch()} />
            <RetrievalCard characterId={characterId} scenarios={characterScenarios} />
            <ConsistencyCard characterId={characterId} />
          </div>
        </div>
      )}
    </div>
  );
}

function NewMemoryCard({ characterId, scenarios, onCreated }: { characterId: string; scenarios: { id: string; title: string }[]; onCreated(): void }) {
  const { t } = useTranslation();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const empty = { content: '', category: 'semantic' as MemoryCategory, scenarioId: '', importance: 3, epistemicStatus: 'fact' as EpistemicStatus };
  const [d, setD] = useState(empty);
  return (
    <Card title={t('memory.new')}>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post('/api/memories', { ...d, characterId, scenarioId: d.category === 'contextual' ? d.scenarioId || null : null });
            setD(empty);
            toast(t('memory.created'), 'success');
            onCreated();
          } catch (err) {
            toast(errorText(err), 'error');
          }
        }}
      >
        <Textarea rows={3} value={d.content} onChange={(e) => setD({ ...d, content: e.target.value })} placeholder={t('memory.content')} aria-label={t('memory.content')} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as MemoryCategory })} aria-label={t('memory.category')}>
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`enums.memoryCategory.${c}`)}
              </option>
            ))}
          </Select>
          <Select value={d.epistemicStatus} onChange={(e) => setD({ ...d, epistemicStatus: e.target.value as EpistemicStatus })} aria-label={t('memory.epistemic')}>
            {EPISTEMIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`enums.epistemic.${s}`)}
              </option>
            ))}
          </Select>
          <Select value={d.importance} onChange={(e) => setD({ ...d, importance: Number(e.target.value) })} aria-label={t('memory.importance')}>
            {[1, 2, 3, 4, 5].map((i) => (
              <option key={i} value={i}>
                {t('memory.importance')}: {i}
              </option>
            ))}
          </Select>
          {d.category === 'contextual' && (
            <Select value={d.scenarioId} onChange={(e) => setD({ ...d, scenarioId: e.target.value })} aria-label={t('memory.scenario')}>
              <option value="">{t('memory.scenario')}…</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          )}
        </div>
        <p className="text-xs text-muted">{t(`enums.memoryCategoryHelp.${d.category}`)}</p>
        <div>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!d.content.trim() || (d.category === 'contextual' && !d.scenarioId)}>
            {t('common.add')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RetrievalCard({ characterId, scenarios }: { characterId: string; scenarios: { id: string; title: string }[] }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [res, setRes] = useState<{ mode: 'lexical' | 'hybrid'; semanticError: string | null; core: RetrievedRow[]; scoped: RetrievedRow[] } | null>(null);
  return (
    <Card title={t('memory.retrievalPreview')}>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setRes(await api.post('/api/memories/retrieve', { characterId, scenarioId: scope || null, query }));
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('memory.retrievalPlaceholder')} aria-label={t('memory.retrievalPreview')} />
        <Field label={t('memory.retrievalScope')}>
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t('memory.lab')}</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Button type="submit" icon={<ScanSearch className="size-4" />}>
            {t('common.preview')}
          </Button>
        </div>
        <p className="text-[11px] text-muted">{t('memory.lexicalNote')}</p>
      </form>
      {res && (
        <div className="mt-3 flex flex-col gap-2 text-xs">
          <Badge tone={res.mode === 'hybrid' ? 'accent' : 'neutral'}>{res.mode === 'hybrid' ? t('memory.modeHybrid') : t('memory.modeLexical')}</Badge>
          {res.semanticError && <div className="text-warn">{t('inspector.semanticError', { error: res.semanticError })}</div>}
          <div className="font-medium text-muted">{t('memory.coreAlways')}</div>
          {res.core.length === 0 && <div className="text-muted">—</div>}
          {res.core.map((m) => (
            <div key={m.id}>{m.content}</div>
          ))}
          <div className="mt-2 font-medium text-muted">{t('memory.scoped')}</div>
          {res.scoped.length === 0 && <div className="text-muted">{t('common.noResults')}</div>}
          {res.scoped.map((m) => (
            <div key={m.id} className="flex gap-1.5">
              <Badge tone={categoryTone(m.category)}>{t(`enums.memoryCategory.${m.category}`)}</Badge>
              <span className="flex-1">{m.content}</span>
              <span className="font-mono text-muted" title={t('memory.score')}>
                {m.score?.toFixed(2)}
                {m.semantic !== undefined && <span className="text-accent" title={t('memory.semantic')}> ·{m.semantic.toFixed(2)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ConsistencyCard({ characterId }: { characterId: string }) {
  const { t } = useTranslation();
  const [useLlm, setUseLlm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<MemoryConsistencyReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  return (
    <Card title={t('memory.consistency')}>
      <div className="flex flex-col gap-2">
        <Checkbox label={t('memory.consistencyLlm')} checked={useLlm} onChange={setUseLlm} />
        <div>
          <Button
            icon={<ShieldCheck className="size-4" />}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                setReport(await api.post<MemoryConsistencyReport>(`/api/characters/${characterId}/memory/consistency?llm=${useLlm ? 1 : 0}`));
              } catch (err) {
                setError(err);
              } finally {
                setLoading(false);
              }
            }}
          >
            {t('memory.consistency')}
          </Button>
        </div>
        {error != null && <ErrorBox error={error} />}
        {report && (
          <div className="flex flex-col gap-1.5 text-xs">
            {report.issues.length === 0 && <p className="text-ok">{t('memory.consistencyOk')}</p>}
            {report.issues.map((i, k) => (
              <div key={k} className={i.severity === 'warning' ? 'text-warn' : 'text-muted'}>
                <span className="font-medium">{t(`memory.issues.${i.kind}`)}</span>
                {i.kind !== 'pending_proposals' && <>: {i.detail}</>}
                {i.kind === 'pending_proposals' && <> ({i.detail})</>}
              </div>
            ))}
            {report.llmChecked && <p className="text-muted">{t('memory.llmChecked')}</p>}
            {report.llmError && <p className="text-warn">{t('memory.llmError', { error: report.llmError })}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
