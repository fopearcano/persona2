import type { ScenarioDetail, ScenarioExportV1 } from '@persona/shared/client';
import { FolderKanban, Orbit, Plus, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useInvalidate, useScenarios } from '../api/hooks';
import { Badge, Button, Checkbox, EmptyState, ErrorBox, Input, Modal, PageHeader, Spinner, useErrorText } from '../components/ui';
import { formatRelative } from '../lib/format';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';

export function ScenariosPage() {
  const { t } = useTranslation();
  const { projectId, project, projects } = useActiveProject();
  const { data, isLoading, error } = useScenarios(projectId);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importOpts, setImportOpts] = useState({ characters: 'reuse' as 'reuse' | 'new', sessions: true });

  const onImport = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text()) as ScenarioExportV1;
      const res = await api.post<{
        scenario: ScenarioDetail;
        characters: { reused: number; imported: number };
        imported: { sessions: number; memories: number };
      }>(
        `/api/scenarios/import?characters=${importOpts.characters}&sessions=${importOpts.sessions ? 1 : 0}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`,
        bundle,
      );
      toast(
        t('scenarios.importDone', {
          title: res.scenario.title,
          imported: res.characters.imported,
          reused: res.characters.reused,
          sessions: res.imported.sessions,
          memories: res.imported.memories,
        }),
        'success',
      );
      setImportOpen(false);
      await invalidate('scenarios', 'characters', 'projects');
      navigate(`/scenarios/${res.scenario.id}`);
    } catch (err) {
      toast(err instanceof SyntaxError ? t('errors.invalid_import') : errorText(err), 'error');
    }
  };

  const create = async () => {
    if (!title.trim()) return;
    try {
      const s = await api.post<ScenarioDetail>('/api/scenarios', { title: title.trim(), projectId });
      await invalidate('scenarios', 'projects');
      toast(t('scenarios.created'), 'success');
      navigate(`/scenarios/${s.id}`);
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('scenarios.title')}
        subtitle={t('scenarios.subtitle')}
        actions={
          <>
          <Button icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
            {t('scenarios.import')}
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('scenarios.fields.title')} aria-label={t('scenarios.fields.title')} />
            <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!title.trim()}>
              {t('scenarios.new')}
            </Button>
          </form>
          </>
        }
      />
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t('scenarios.import')}>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="chars" checked={importOpts.characters === 'reuse'} onChange={() => setImportOpts({ ...importOpts, characters: 'reuse' })} />
            {t('scenarios.importReuse')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="chars" checked={importOpts.characters === 'new'} onChange={() => setImportOpts({ ...importOpts, characters: 'new' })} />
            {t('scenarios.importNew')}
          </label>
          <Checkbox label={t('scenarios.importSessions')} checked={importOpts.sessions} onChange={(v) => setImportOpts({ ...importOpts, sessions: v })} />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onImport(f);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setImportOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              {t('common.import')}
            </Button>
          </div>
        </div>
      </Modal>
      <div className="px-6 py-4">
        <p className="mb-4 max-w-3xl text-sm text-muted">{t('scenarios.isolationNote')}</p>
        {isLoading && <Spinner />}
        {error && <ErrorBox error={error} />}
        {data?.length === 0 && <EmptyState>{project ? t('scenarios.emptyProject') : t('scenarios.empty')}</EmptyState>}
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {data?.map((s) => (
            <li key={s.id}>
              <Link to={`/scenarios/${s.id}`} className="flex h-full flex-col gap-2 rounded-lg border border-border bg-panel p-4 hover:bg-panel-2/50">
                <div className="flex items-center gap-2">
                  <Orbit className="size-4 text-narration" aria-hidden />
                  <span className="font-semibold">{s.title}</span>
                  {s.status === 'archived' && <Badge>{t('enums.scenarioStatus.archived')}</Badge>}
                </div>
                {!project && (
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <FolderKanban className="size-3" aria-hidden />
                    {(s.projectId && projectNames.get(s.projectId)) || t('projects.none')}
                  </div>
                )}
                {(s.description || s.setting) && <p className="line-clamp-2 text-sm text-muted">{s.description ?? s.setting}</p>}
                <div className="mt-auto flex flex-wrap gap-1">
                  {s.participantNames.map((n) => (
                    <Badge key={n}>{n}</Badge>
                  ))}
                </div>
                <div className="text-xs text-muted">
                  {t('scenarios.participants', { count: s.participantCount })} · {t('scenarios.sessions', { count: s.conversationCount })} · {formatRelative(s.updatedAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
