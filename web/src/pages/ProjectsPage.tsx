import type { Project, ProjectExportV1, ProjectSummary } from '@persona/shared/client';
import { Check, Download, FolderKanban, FolderOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api, downloadUrl } from '../api/client';
import { useInvalidate } from '../api/hooks';
import { Badge, Button, Checkbox, EmptyState, ErrorBox, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Textarea, useErrorText } from '../components/ui';
import { formatRelative } from '../lib/format';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';

/** Progetti: ogni progetto è una storia che raggruppa personaggi, scenari e simulazioni. */
export function ProjectsPage() {
  const { t } = useTranslation();
  const { projectId, projects, loading, setActive } = useActiveProject();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [deleteCharacters, setDeleteCharacters] = useState(false);
  const [saving, setSaving] = useState<ProjectSummary | null>(null);
  const [saveOpts, setSaveOpts] = useState({ conversations: true, sessions: true });
  const [opening, setOpening] = useState(false);
  const [openMode, setOpenMode] = useState<'reuse' | 'new'>('reuse');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => invalidate('projects', 'characters', 'scenarios', 'conversations', 'memories');

  const activate = (p: { id: string; name: string } | null, goTo?: string) => {
    setActive(p?.id ?? null);
    if (p) toast(t('projects.activated', { name: p.name }), 'success');
    if (goTo) navigate(goTo);
  };

  const create = async () => {
    try {
      const p = await api.post<Project>('/api/projects', { name: draft.name.trim(), description: draft.description || null });
      setDraft({ name: '', description: '' });
      toast(t('projects.created'), 'success');
      await refresh();
      activate(p, '/characters');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const openFile = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text()) as ProjectExportV1;
      const res = await api.post<{
        project: Project;
        characters: { reused: number; imported: number };
        imported: { scenarios: number };
      }>(`/api/projects/import?characters=${openMode}`, bundle);
      toast(
        t('projects.opened', {
          name: res.project.name,
          imported: res.characters.imported,
          reused: res.characters.reused,
          scenarios: res.imported.scenarios,
        }),
        'success',
      );
      setOpening(false);
      await refresh();
      activate(res.project);
    } catch (err) {
      toast(err instanceof SyntaxError ? t('errors.invalid_import') : errorText(err), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        actions={
          <Button icon={<Upload className="size-4" />} onClick={() => setOpening(true)}>
            {t('projects.openFile')}
          </Button>
        }
      />
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-4">
        <p className="text-xs text-muted">{t('projects.autosaveNote')}</p>
        <form
          className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-panel p-4 md:grid-cols-[1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.name.trim()) void create();
          }}
        >
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('projects.namePlaceholder')} aria-label={t('projects.name')} />
          <Input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t('projects.descriptionPlaceholder')}
            aria-label={t('projects.description')}
          />
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!draft.name.trim()}>
            {t('projects.new')}
          </Button>
        </form>

        {loading && <Spinner />}
        {!loading && projects.length === 0 && <EmptyState>{t('projects.empty')}</EmptyState>}
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {projects.map((p) => {
            const isActive = p.id === projectId;
            return (
              <li key={p.id} className={`flex flex-col rounded-lg border bg-panel ${isActive ? 'border-accent' : 'border-border'}`}>
                <div className="flex items-start gap-3 p-4">
                  <FolderKanban className={`mt-0.5 size-5 shrink-0 ${isActive ? 'text-accent' : 'text-muted'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold">{p.name}</span>
                      {isActive && (
                        <Badge tone="accent">
                          <Check className="size-3" aria-hidden /> {t('projects.active')}
                        </Badge>
                      )}
                      {p.status === 'archived' && <Badge>{t('enums.projectStatus.archived')}</Badge>}
                    </div>
                    {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{p.description}</p>}
                    <p className="mt-2 text-xs text-muted">
                      {t('projects.characters', { count: p.characterCount })} · {t('projects.scenarios', { count: p.scenarioCount })} ·{' '}
                      {t('projects.simulations', { count: p.simulationCount })} · {t('projects.lastActivity', { when: formatRelative(p.lastActivityAt) })}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
                  <Button size="sm" variant={isActive ? 'secondary' : 'primary'} icon={<FolderOpen className="size-3.5" />} onClick={() => activate(p, '/characters')}>
                    {t('projects.open')}
                  </Button>
                  <div className="flex items-center">
                    <IconButton label={t('common.edit')} icon={<Pencil className="size-4" />} onClick={() => setEditing(p)} />
                    <IconButton label={t('projects.save')} icon={<Download className="size-4" />} onClick={() => setSaving(p)} />
                    <IconButton
                      label={t('projects.delete')}
                      icon={<Trash2 className="size-4" />}
                      className="hover:text-danger"
                      onClick={() => {
                        setDeleteCharacters(false);
                        setDeleting(p);
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {editing && <EditProjectModal project={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={t('projects.delete')}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t('projects.deleteConfirm', { name: deleting?.name ?? '' })}</p>
          <Checkbox label={t('projects.deleteCharactersToo')} checked={deleteCharacters} onChange={setDeleteCharacters} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!deleting) return;
                try {
                  await api.del(`/api/projects/${deleting.id}?deleteCharacters=${deleteCharacters ? 1 : 0}`);
                  if (deleting.id === projectId) setActive(null);
                  toast(t('projects.deleted'), 'success');
                  setDeleting(null);
                  await refresh();
                } catch (err) {
                  toast(errorText(err), 'error');
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!saving} onClose={() => setSaving(null)} title={`${t('projects.saveTitle')} — ${saving?.name ?? ''}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('projects.saveHelp')}</p>
          <Checkbox label={t('projects.saveConversations')} checked={saveOpts.conversations} onChange={(v) => setSaveOpts({ ...saveOpts, conversations: v })} />
          <Checkbox label={t('projects.saveSessions')} checked={saveOpts.sessions} onChange={(v) => setSaveOpts({ ...saveOpts, sessions: v })} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSaving(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              icon={<Download className="size-4" />}
              onClick={() => {
                if (!saving) return;
                downloadUrl(`/api/projects/${saving.id}/export?conversations=${saveOpts.conversations ? 1 : 0}&sessions=${saveOpts.sessions ? 1 : 0}`);
                toast(t('toast.exported'), 'success');
                setSaving(null);
              }}
            >
              {t('projects.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={opening} onClose={() => setOpening(false)} title={t('projects.openTitle')}>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="open-mode" checked={openMode === 'reuse'} onChange={() => setOpenMode('reuse')} />
            {t('projects.openReuse')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="open-mode" checked={openMode === 'new'} onChange={() => setOpenMode('new')} />
            {t('projects.openNew')}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void openFile(f);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpening(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              {t('projects.openFile')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EditProjectModal({ project, onClose, onSaved }: { project: ProjectSummary; onClose(): void; onSaved(): void }) {
  const { t } = useTranslation();
  const toast = useUi((s) => s.toast);
  const [d, setD] = useState({ name: project.name, description: project.description ?? '', status: project.status });
  const [error, setError] = useState<unknown>(null);
  return (
    <Modal open onClose={onClose} title={project.name}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.put(`/api/projects/${project.id}`, { name: d.name, description: d.description || null, status: d.status });
            toast(t('toast.saved'), 'success');
            onSaved();
            onClose();
          } catch (err) {
            setError(err);
          }
        }}
      >
        <Field label={t('projects.name')}>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label={t('projects.description')}>
          <Textarea rows={4} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as ProjectSummary['status'] })}>
            <option value="active">{t('enums.projectStatus.active')}</option>
            <option value="archived">{t('enums.projectStatus.archived')}</option>
          </Select>
        </Field>
        {error != null && <ErrorBox error={error} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!d.name.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
