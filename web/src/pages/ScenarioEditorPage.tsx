import type { Conversation, Scenario, ScenarioDetail, ScenarioInput, ScenarioParticipant } from '@persona/shared/client';
import { ArrowLeft, Download, Drama, MessageSquarePlus, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, downloadUrl } from '../api/client';
import { useCharacters, useConversations, useInvalidate, useMemories, useScenario } from '../api/hooks';
import { ChatWorkspace } from '../components/chat/ChatWorkspace';
import { LanguageSelect } from '../components/LanguageSelect';
import { MemoryRow } from '../components/MemoryRow';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBox, Field, IconButton, Input, Modal, Select, Spinner, Tabs, TextField, useErrorText } from '../components/ui';
import { formatRelative } from '../lib/format';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';

type TabId = 'details' | 'participants' | 'events' | 'sessions' | 'memories';
type DetailsDraft = Omit<ScenarioInput, 'status'> & { status: Scenario['status'] };

const FIELDS = ['description', 'setting', 'timeline', 'environment', 'initialSituation', 'currentSituation', 'knowledge'] as const;

function toDraft(s: ScenarioDetail): DetailsDraft {
  return {
    title: s.title,
    description: s.description,
    setting: s.setting,
    timeline: s.timeline,
    environment: s.environment,
    initialSituation: s.initialSituation,
    currentSituation: s.currentSituation,
    knowledge: s.knowledge,
    language: s.language,
    status: s.status,
    projectId: s.projectId,
  };
}

export function ScenarioEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'details';
  const { data: scenario, isLoading, error, refetch } = useScenario(id);
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSessions, setExportSessions] = useState(true);

  if (isLoading) return <Spinner />;
  if (error || !scenario) return <div className="p-6"><ErrorBox error={error} /></div>;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok, 'success');
      await refetch();
      void invalidate('scenarios', 'projects', 'characters');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pt-4">
        <div className="flex items-center gap-3">
          <Link to="/scenarios" className="text-muted hover:text-text" aria-label={t('common.back')}>
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="flex-1 truncate text-lg font-semibold">{scenario.title}</h1>
          <Button icon={<Download className="size-4" />} onClick={() => setExportOpen(true)}>
            {t('scenarios.export')}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (!window.confirm(t('scenarios.deleteConfirm'))) return;
              await api.del(`/api/scenarios/${scenario.id}`);
              await invalidate('scenarios', 'memories', 'conversations', 'projects');
              navigate('/scenarios');
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">{t('scenarios.isolationNote')}</p>
        <Tabs
          className="mt-2"
          value={tab}
          onChange={(v) => setParams((p) => (p.set('tab', v), p), { replace: true })}
          tabs={[
            { id: 'details', label: t('scenarios.tabs.details') },
            { id: 'participants', label: t('scenarios.tabs.participants'), badge: <Badge>{scenario.participants.length}</Badge> },
            { id: 'events', label: t('scenarios.tabs.events'), badge: scenario.events.length ? <Badge>{scenario.events.length}</Badge> : undefined },
            { id: 'sessions', label: t('scenarios.tabs.sessions') },
            { id: 'memories', label: t('scenarios.tabs.memories') },
          ]}
        />
      </div>
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title={`${t('scenarios.export')} — ${scenario.title}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('scenarios.exportHelp')}</p>
          <Checkbox label={t('scenarios.exportSessions')} checked={exportSessions} onChange={setExportSessions} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExportOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              icon={<Download className="size-4" />}
              onClick={() => {
                downloadUrl(`/api/scenarios/${scenario.id}/export?sessions=${exportSessions ? 1 : 0}`);
                toast(t('toast.exported'), 'success');
                setExportOpen(false);
              }}
            >
              {t('common.export')}
            </Button>
          </div>
        </div>
      </Modal>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-5">
        {tab === 'details' && <DetailsTab scenario={scenario} onSaved={() => void run(async () => undefined, t('toast.saved'))} />}
        {tab === 'participants' && <ParticipantsTab scenario={scenario} run={run} />}
        {tab === 'events' && <EventsTab scenario={scenario} run={run} />}
        {tab === 'sessions' && <SessionsTab scenario={scenario} />}
        {tab === 'memories' && <ScenarioMemoriesTab scenario={scenario} />}
      </div>
    </div>
  );
}

function DetailsTab({ scenario, onSaved }: { scenario: ScenarioDetail; onSaved(): void }) {
  const { t } = useTranslation();
  const { projects } = useActiveProject();
  const [draft, setDraft] = useState<DetailsDraft>(() => toDraft(scenario));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setDraft(toDraft(scenario)), [scenario]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(scenario));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label={t('scenarios.fields.title')} value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
        <Field label={t('scenarios.fields.language')}>
          <LanguageSelect value={draft.language} allowNone noneLabel={t('scenarios.languageNone')} onChange={(v) => setDraft({ ...draft, language: v })} />
        </Field>
        <Field label={t('projects.projectField')} help={t('projects.moveHelp')}>
          <Select value={draft.projectId ?? ''} onChange={(e) => setDraft({ ...draft, projectId: e.target.value || null })}>
            <option value="">{t('projects.none')}</option>
            {projects
              .filter((p) => p.status === 'active' || p.id === draft.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={t('scenarios.fields.status')}>
          <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Scenario['status'] })}>
            <option value="active">{t('enums.scenarioStatus.active')}</option>
            <option value="archived">{t('enums.scenarioStatus.archived')}</option>
          </Select>
        </Field>
        {FIELDS.map((f) => (
          <TextField
            key={f}
            className={f === 'knowledge' || f === 'description' ? 'md:col-span-2' : undefined}
            label={t(`scenarios.fields.${f}`)}
            multiline
            rows={f === 'knowledge' ? 6 : 3}
            value={draft[f]}
            onChange={(v) => setDraft({ ...draft, [f]: v })}
          />
        ))}
      </div>
      {error != null && <ErrorBox error={error} />}
      <div>
        <Button
          variant="primary"
          icon={<Save className="size-4" />}
          loading={saving}
          disabled={!dirty || !draft.title.trim()}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await api.put(`/api/scenarios/${scenario.id}`, draft);
              onSaved();
            } catch (err) {
              setError(err);
            } finally {
              setSaving(false);
            }
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function ParticipantCard({ p, run }: { p: ScenarioParticipant; run(fn: () => Promise<unknown>, ok?: string): Promise<void> }) {
  const { t } = useTranslation();
  const [d, setD] = useState({ role: p.role, roleDescription: p.roleDescription, knowledge: p.knowledge, objectives: p.objectives });
  const dirty = JSON.stringify(d) !== JSON.stringify({ role: p.role, roleDescription: p.roleDescription, knowledge: p.knowledge, objectives: p.objectives });
  return (
    <Card
      title={
        <Link to={`/characters/${p.characterId}`} className="hover:underline">
          {p.characterName}
        </Link>
      }
      actions={
        <>
          <Button size="sm" variant="primary" disabled={!dirty} onClick={() => void run(() => api.put(`/api/scenario-participants/${p.id}`, d), t('scenarios.participantSaved'))}>
            {t('common.save')}
          </Button>
          <IconButton
            label={t('scenarios.removeParticipant')}
            icon={<Trash2 className="size-4" />}
            onClick={() => window.confirm(t('scenarios.removeParticipantConfirm')) && void run(() => api.del(`/api/scenario-participants/${p.id}`))}
          />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField label={t('scenarios.role')} value={d.role} onChange={(v) => setD({ ...d, role: v })} />
        <TextField label={t('scenarios.objectives')} value={d.objectives} onChange={(v) => setD({ ...d, objectives: v })} />
        <TextField label={t('scenarios.roleDescription')} multiline value={d.roleDescription} onChange={(v) => setD({ ...d, roleDescription: v })} />
        <TextField label={t('scenarios.participantKnowledge')} multiline value={d.knowledge} onChange={(v) => setD({ ...d, knowledge: v })} />
      </div>
    </Card>
  );
}

function ParticipantsTab({ scenario, run }: { scenario: ScenarioDetail; run(fn: () => Promise<unknown>, ok?: string): Promise<void> }) {
  const { t } = useTranslation();
  const { data: characters } = useCharacters('active');
  const available = (characters ?? []).filter((c) => !scenario.participants.some((p) => p.characterId === c.id));
  // Prima i personaggi del progetto dello scenario; gli altri entrano nel progetto se aggiunti.
  const inProject = scenario.projectId ? available.filter((c) => c.projectIds.includes(scenario.projectId!)) : available;
  const fromOther = scenario.projectId ? available.filter((c) => !c.projectIds.includes(scenario.projectId!)) : [];
  const [add, setAdd] = useState({ characterId: '', role: '' });
  const [rel, setRel] = useState({ fromCharacterId: '', toCharacterId: '', description: '' });
  const nameOf = (id: string) => scenario.participants.find((p) => p.characterId === id)?.characterName ?? id;
  return (
    <div className="flex flex-col gap-4">
      <Card title={t('scenarios.addParticipant')}>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!add.characterId) return;
            void run(() => api.post(`/api/scenarios/${scenario.id}/participants`, { characterId: add.characterId, role: add.role || null })).then(() =>
              setAdd({ characterId: '', role: '' }),
            );
          }}
        >
          <Field label={t('nav.characters')} className="w-64">
            <Select value={add.characterId} onChange={(e) => setAdd({ ...add, characterId: e.target.value })}>
              <option value="">{t('common.select')}</option>
              {inProject.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {fromOther.length > 0 && (
                <optgroup label={t('projects.otherProjects')}>
                  {fromOther.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>
          <Field label={t('scenarios.role')} className="min-w-64 flex-1">
            <Input value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} />
          </Field>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!add.characterId}>
            {t('common.add')}
          </Button>
        </form>
      </Card>
      {scenario.participants.length === 0 && <EmptyState>{t('scenarios.noParticipants')}</EmptyState>}
      {scenario.participants.map((p) => (
        <ParticipantCard key={p.id} p={p} run={run} />
      ))}
      <Card title={t('scenarios.relationships')}>
        {scenario.relationships.length === 0 && <p className="mb-3 text-sm text-muted">{t('scenarios.noRelationships')}</p>}
        <ul className="mb-3 flex flex-col gap-1">
          {scenario.relationships.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{nameOf(r.fromCharacterId)}</span>→<span className="font-medium">{nameOf(r.toCharacterId)}</span>
              <span className="flex-1 text-muted">{r.description}</span>
              <IconButton label={t('common.remove')} icon={<X className="size-3.5" />} onClick={() => void run(() => api.del(`/api/scenario-relationships/${r.id}`))} />
            </li>
          ))}
        </ul>
        {scenario.participants.length >= 2 && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.post(`/api/scenarios/${scenario.id}/relationships`, rel)).then(() => setRel({ fromCharacterId: '', toCharacterId: '', description: '' }));
            }}
          >
            {(['fromCharacterId', 'toCharacterId'] as const).map((k) => (
              <Field key={k} label={k === 'fromCharacterId' ? t('scenarios.from') : t('scenarios.to')} className="w-48">
                <Select value={rel[k]} onChange={(e) => setRel({ ...rel, [k]: e.target.value })}>
                  <option value="">{t('common.select')}</option>
                  {scenario.participants.map((p) => (
                    <option key={p.characterId} value={p.characterId}>
                      {p.characterName}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label={t('scenarios.relationshipDescription')} className="min-w-64 flex-1">
              <Input value={rel.description} onChange={(e) => setRel({ ...rel, description: e.target.value })} />
            </Field>
            <Button type="submit" icon={<Plus className="size-4" />} disabled={!rel.fromCharacterId || !rel.toCharacterId || !rel.description.trim()}>
              {t('scenarios.addRelationship')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function EventsTab({ scenario, run }: { scenario: ScenarioDetail; run(fn: () => Promise<unknown>, ok?: string): Promise<void> }) {
  const { t } = useTranslation();
  const [ev, setEv] = useState({ title: '', fictionalTime: '', content: '' });
  return (
    <div className="flex flex-col gap-4">
      {scenario.events.length === 0 && <EmptyState>{t('scenarios.noEvents')}</EmptyState>}
      <ol className="flex flex-col gap-2">
        {scenario.events.map((e) => (
          <li key={e.id} className="flex gap-3 rounded-lg border border-border bg-panel p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {e.fictionalTime && <Badge tone="narration">{e.fictionalTime}</Badge>}
                {e.title && <span className="font-medium">{e.title}</span>}
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{e.content}</p>
            </div>
            <IconButton label={t('common.delete')} icon={<Trash2 className="size-4" />} onClick={() => void run(() => api.del(`/api/scenario-events/${e.id}`))} />
          </li>
        ))}
      </ol>
      <Card title={t('scenarios.addEvent')}>
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.post(`/api/scenarios/${scenario.id}/events`, ev)).then(() => setEv({ title: '', fictionalTime: '', content: '' }));
          }}
        >
          <TextField label={t('scenarios.eventTitle')} value={ev.title} onChange={(v) => setEv({ ...ev, title: v })} />
          <TextField label={t('scenarios.fictionalTime')} value={ev.fictionalTime} onChange={(v) => setEv({ ...ev, fictionalTime: v })} />
          <TextField className="md:col-span-2" label={t('scenarios.eventContent')} multiline value={ev.content} onChange={(v) => setEv({ ...ev, content: v })} />
          <div>
            <Button type="submit" icon={<Plus className="size-4" />} disabled={!ev.content.trim()}>
              {t('scenarios.addEvent')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SessionsTab({ scenario }: { scenario: ScenarioDetail }) {
  const { t } = useTranslation();
  const { data: conversations } = useConversations({ scenarioId: scenario.id, archived: '1' });
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const [who, setWho] = useState('');
  const nameOf = (id: string) => scenario.participants.find((p) => p.characterId === id)?.characterName ?? '?';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('scenarios.newSession')} className="w-64">
          <Select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {scenario.participants.map((p) => (
              <option key={p.characterId} value={p.characterId}>
                {p.characterName}
                {p.role ? ` — ${p.role}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="primary"
          icon={<MessageSquarePlus className="size-4" />}
          disabled={!who}
          onClick={async () => {
            try {
              const conv = await api.post<Conversation>('/api/conversations', { kind: 'scenario', scenarioId: scenario.id, characterId: who });
              await invalidate('conversations');
              navigate(`/scenarios/${scenario.id}/sessions/${conv.id}`);
            } catch (err) {
              toast(errorText(err), 'error');
            }
          }}
        >
          {t('common.create')}
        </Button>
        <Button icon={<Drama className="size-4" />} disabled={scenario.participants.length === 0} onClick={() => navigate(`/simulations?scenarioId=${scenario.id}`)}>
          {t('scenarios.newSimulation')}
        </Button>
      </div>
      {conversations?.length === 0 && <EmptyState>{t('scenarios.noSessions')}</EmptyState>}
      <ul className="flex flex-col gap-2">
        {conversations?.map((c) => (
          <li key={c.id}>
            <Link
              to={c.kind === 'simulation' ? `/simulations/${c.id}` : `/scenarios/${scenario.id}/sessions/${c.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3 hover:bg-panel-2/50"
            >
              <Badge tone="narration">{t(`enums.kind.${c.kind}`)}</Badge>
              <span className="flex-1 truncate font-medium">{c.title}</span>
              <span className="text-xs text-muted">
                {c.participantIds.map(nameOf).join(', ')} · {formatRelative(c.lastMessageAt ?? c.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScenarioMemoriesTab({ scenario }: { scenario: ScenarioDetail }) {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useMemories({ scenarioId: scenario.id });
  const nameOf = (id: string) => scenario.participants.find((p) => p.characterId === id)?.characterName ?? '?';
  if (isLoading) return <Spinner />;
  if (!data?.length) return <EmptyState>{t('scenarios.noMemories')}</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {data.map((m) => (
        <MemoryRow key={m.id} memory={m} scenarioTitle={scenario.title} characterName={nameOf(m.characterId)} onChanged={() => void refetch()} />
      ))}
    </ul>
  );
}

export function ScenarioSessionPage() {
  const { id, conversationId } = useParams();
  const { t } = useTranslation();
  const { data: scenario } = useScenario(id);
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-sm">
        <Link to={`/scenarios/${id}?tab=sessions`} className="inline-flex items-center gap-1 text-muted hover:text-text">
          <ArrowLeft className="size-4" /> {t('scenarios.backToScenario')}
        </Link>
        <span className="text-narration">{scenario?.title}</span>
      </div>
      <div className="min-h-0 flex-1">
        {conversationId && <ChatWorkspace key={conversationId} conversationId={conversationId} onDeleted={() => navigate(`/scenarios/${id}?tab=sessions`)} />}
      </div>
    </div>
  );
}
