import type { Conversation, TurnMode } from '@persona/shared/client';
import { TURN_MODES } from '@persona/shared/client';
import { ArrowLeft, Drama, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { useConversation, useConversations, useInvalidate, useScenario, useScenarios } from '../api/hooks';
import { ChatWorkspace } from '../components/chat/ChatWorkspace';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select, Spinner, useErrorText } from '../components/ui';
import { formatRelative } from '../lib/format';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';

export function SimulationsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { projectId } = useActiveProject();
  const { data: scenarios } = useScenarios(projectId);
  const { data: sims, isLoading } = useConversations({ kind: 'simulation', archived: '1', projectId: projectId ?? undefined });
  const [scenarioId, setScenarioId] = useState(params.get('scenarioId') ?? '');
  const { data: scenario } = useScenario(scenarioId || undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [turnMode, setTurnMode] = useState<TurnMode>('manual');
  const [creating, setCreating] = useState(!!params.get('scenarioId'));
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();

  useEffect(() => {
    setSelected(scenario?.participants.map((p) => p.characterId) ?? []);
  }, [scenario]);

  const scenarioTitle = useMemo(() => new Map((scenarios ?? []).map((s) => [s.id, s.title])), [scenarios]);
  const usable = (scenarios ?? []).filter((s) => s.participantCount > 0);

  return (
    <div>
      <PageHeader
        title={t('simulations.title')}
        subtitle={t('simulations.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('simulations.new')}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-6 py-4">
        <p className="max-w-3xl text-sm text-muted">{t('simulations.help')}</p>
        {creating && (
          <Card title={t('simulations.new')}>
            {usable.length === 0 ? (
              <EmptyState action={<Link className="text-accent hover:underline" to="/scenarios">{t('nav.scenarios')}</Link>}>{t('simulations.noScenarios')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label={t('simulations.scenario')}>
                    <Select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                      <option value="">{t('simulations.selectScenario')}</option>
                      {usable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                      {/* Scenario aperto da un link (?scenarioId=) ma fuori dal progetto attivo. */}
                      {scenario && !usable.some((s) => s.id === scenario.id) && <option value={scenario.id}>{scenario.title}</option>}
                    </Select>
                  </Field>
                  <Field label={t('simulations.titleField')}>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                  </Field>
                  <Field label={t('simulations.turnMode')}>
                    <Select value={turnMode} onChange={(e) => setTurnMode(e.target.value as TurnMode)}>
                      {TURN_MODES.map((m) => (
                        <option key={m} value={m}>
                          {t(`enums.turnMode.${m}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {scenario && (
                  <Field group label={t('simulations.participants')}>
                    {scenario.participants.length === 0 ? (
                      <p className="text-sm text-muted">{t('simulations.needParticipants')}</p>
                    ) : (
                      <div className="flex flex-wrap gap-4">
                        {scenario.participants.map((p) => (
                          <Checkbox
                            key={p.characterId}
                            label={
                              <>
                                {p.characterName}
                                {p.role && <span className="text-muted"> — {p.role}</span>}
                              </>
                            }
                            checked={selected.includes(p.characterId)}
                            onChange={(v) => setSelected((s) => (v ? [...s, p.characterId] : s.filter((x) => x !== p.characterId)))}
                          />
                        ))}
                      </div>
                    )}
                  </Field>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
                  <Button
                    variant="primary"
                    icon={<Drama className="size-4" />}
                    disabled={!scenarioId || selected.length === 0}
                    onClick={async () => {
                      try {
                        const conv = await api.post<Conversation>('/api/conversations', {
                          kind: 'simulation',
                          scenarioId,
                          participantIds: selected,
                          title: title.trim() || undefined,
                          turnMode,
                        });
                        await invalidate('conversations');
                        navigate(`/simulations/${conv.id}`);
                      } catch (err) {
                        toast(errorText(err), 'error');
                      }
                    }}
                  >
                    {t('simulations.create')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
        {isLoading && <Spinner />}
        {sims?.length === 0 && !creating && <EmptyState>{t('simulations.empty')}</EmptyState>}
        <ul className="flex flex-col gap-2">
          {sims?.map((c) => (
            <li key={c.id}>
              <Link to={`/simulations/${c.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3 hover:bg-panel-2/50">
                <Drama className="size-4 text-narration" aria-hidden />
                <span className="flex-1 truncate font-medium">{c.title}</span>
                {c.scenarioId && <Badge tone="narration">{scenarioTitle.get(c.scenarioId)}</Badge>}
                <span className="text-xs text-muted">
                  {t('simulations.participants')}: {c.participantIds.length} · {formatRelative(c.lastMessageAt ?? c.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SimulationPage() {
  const { conversationId } = useParams();
  const { t } = useTranslation();
  const { data: conv } = useConversation(conversationId);
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-sm">
        <Link to="/simulations" className="inline-flex items-center gap-1 text-muted hover:text-text">
          <ArrowLeft className="size-4" /> {t('simulations.title')}
        </Link>
        {conv?.scenarioId && (
          <Link to={`/scenarios/${conv.scenarioId}`} className="text-narration hover:underline">
            {t('simulations.scenario')}
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {conversationId && <ChatWorkspace key={conversationId} conversationId={conversationId} onDeleted={() => navigate('/simulations')} />}
      </div>
    </div>
  );
}
