import type { CharacterExportV1, CharacterSummary } from '@persona/shared/client';
import { Archive, ArchiveRestore, Copy, Download, FolderMinus, FolderPlus, GitBranch, MessagesSquare, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, downloadUrl } from '../api/client';
import { useCharacters, useInvalidate } from '../api/hooks';
import { Badge, Button, Checkbox, EmptyState, ErrorBox, IconButton, Input, Modal, PageHeader, Segmented, Spinner, useErrorText } from '../components/ui';
import { formatRelative, initials, languageLabel } from '../lib/format';
import { useActiveProject, useRemoveFromProject } from '../lib/project';
import { useUi } from '../stores/ui';

type Filter = 'active' | 'archived' | 'all';

export function Portrait({ name, src, size = 'md' }: { name: string; src: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-20 text-xl' : size === 'sm' ? 'size-7 text-[11px]' : 'size-11 text-sm';
  return src ? (
    <img src={src} alt="" className={`${cls} shrink-0 rounded-md border border-border object-cover`} />
  ) : (
    <div aria-hidden className={`${cls} flex shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 font-semibold text-muted`}>
      {initials(name)}
    </div>
  );
}

export function CharactersPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const { projectId, project, projects } = useActiveProject();
  const { data, isLoading, error, refetch } = useCharacters(filter === 'all' ? undefined : filter, projectId);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const [adding, setAdding] = useState(false);
  const removeFromProject = useRemoveFromProject();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState<CharacterSummary | null>(null);
  const [exportOpts, setExportOpts] = useState({ conversations: true, contextual: false, knowledge: true });
  const [importOpen, setImportOpen] = useState(false);
  const [importOpts, setImportOpts] = useState({ memories: true, conversations: true, knowledge: true });
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data ?? [];
    return (data ?? []).filter((c) =>
      [c.name, c.occupation, c.origin, ...c.expertiseDomains].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast(success, 'success');
      await invalidate('characters', 'character', 'projects');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const onImport = async (file: File) => {
    setImporting(true);
    try {
      const json = JSON.parse(await file.text()) as CharacterExportV1;
      const p = new URLSearchParams({
        memories: importOpts.memories ? '1' : '0',
        conversations: importOpts.conversations ? '1' : '0',
        knowledge: importOpts.knowledge ? '1' : '0',
      });
      if (projectId) p.set('projectId', projectId);
      const res = await api.post<{
        character: { id: string; name: string };
        imported: { memories: number; conversations: number; knowledge: number; revisions: number };
        skipped: { contextualMemories: number; scenarioConversations: number };
      }>(`/api/characters/import?${p}`, json);
      setImportOpen(false);
      toast(t('characters.importDone', { name: res.character.name, ...res.imported }), 'success');
      if (res.skipped.contextualMemories || res.skipped.scenarioConversations) {
        toast(t('characters.importSkipped', { memories: res.skipped.contextualMemories, sessions: res.skipped.scenarioConversations }));
      }
      await invalidate('characters', 'projects');
    } catch (err) {
      toast(err instanceof SyntaxError ? t('errors.invalid_import') : errorText(err), 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('characters.title')}
        subtitle={t('characters.subtitle')}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
              {t('characters.import')}
            </Button>
            {project && (
              <Button icon={<FolderPlus className="size-4" />} onClick={() => setAdding(true)}>
                {t('projects.addExisting')}
              </Button>
            )}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/characters/new')}>
              {t('characters.new')}
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <Segmented
          label={t('common.status')}
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'active', label: t('characters.filterActive') },
            { id: 'archived', label: t('characters.filterArchived') },
            { id: 'all', label: t('characters.filterAll') },
          ]}
        />
        <Input className="max-w-xs" placeholder={t('characters.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
      </div>
      <div className="px-6 pb-8">
        {isLoading && <Spinner />}
        {error && <ErrorBox error={error} onRetry={() => void refetch()} />}
        {data && filtered.length === 0 && (
          <EmptyState
            action={
              data.length === 0 && (
                <div className="flex gap-2">
                  {project && (
                    <Button icon={<FolderPlus className="size-4" />} onClick={() => setAdding(true)}>
                      {t('projects.addExisting')}
                    </Button>
                  )}
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/characters/new')}>
                    {t('characters.new')}
                  </Button>
                </div>
              )
            }
          >
            {data.length > 0 ? t('characters.emptyFiltered') : project ? t('characters.emptyProject') : t('characters.empty')}
          </EmptyState>
        )}
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((c) => (
            <li key={c.id} className="flex flex-col rounded-lg border border-border bg-panel">
              <Link to={`/characters/${c.id}`} className="flex gap-3 p-4 hover:bg-panel-2/50">
                <Portrait name={c.name} src={c.portrait} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{c.name}</span>
                    {c.parentId && (
                      <Badge tone="accent" title={c.variantNote ?? undefined}>
                        <GitBranch className="size-3" aria-hidden /> {t('characters.variant')}
                      </Badge>
                    )}
                    {c.status === 'archived' && <Badge>{t('enums.characterStatus.archived')}</Badge>}
                  </div>
                  {!project && c.projectIds.length > 0 && (
                    <div className="truncate text-xs text-muted" title={t('projects.membership')}>
                      {c.projectIds.map((id) => projectNames.get(id)).filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="truncate text-sm text-muted">{[c.occupation, c.origin].filter(Boolean).join(' · ')}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.languages.map((l) => (
                      <Badge key={l.code} tone={l.isNative ? 'accent' : 'neutral'} title={t(`enums.proficiency.${l.proficiency}`)}>
                        {languageLabel(l.code)}
                      </Badge>
                    ))}
                    {c.expertiseDomains.slice(0, 4).map((d) => (
                      <Badge key={d}>{d}</Badge>
                    ))}
                  </div>
                </div>
              </Link>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs text-muted">
                <span>
                  {t('characters.memories', { count: c.memoryCount })} · {t('characters.conversations', { count: c.conversationCount })} ·{' '}
                  {t('characters.identityVersion', { version: c.identityVersion })} · {formatRelative(c.updatedAt)}
                </span>
                <div className="flex items-center">
                  <IconButton label={t('characters.talk')} icon={<MessagesSquare className="size-4" />} onClick={() => navigate(`/dialogue/${c.id}`)} />
                  <IconButton
                    label={t('common.duplicate')}
                    icon={<Copy className="size-4" />}
                    onClick={() => void run(() => api.post(`/api/characters/${c.id}/duplicate`, {}), t('characters.duplicated'))}
                  />
                  <IconButton
                    label={t('characters.createVariant')}
                    icon={<GitBranch className="size-4" />}
                    onClick={() => navigate(`/characters/${c.id}?tab=history`)}
                  />
                  <IconButton label={t('common.export')} icon={<Download className="size-4" />} onClick={() => setExporting(c)} />
                  {project && (
                    <IconButton
                      label={t('projects.removeFromProject')}
                      icon={<FolderMinus className="size-4" />}
                      onClick={() => void removeFromProject(project.id, c)}
                    />
                  )}
                  {c.status === 'active' ? (
                    <IconButton
                      label={t('common.archive')}
                      icon={<Archive className="size-4" />}
                      onClick={() => void run(() => api.put(`/api/characters/${c.id}/status`, { status: 'archived' }))}
                    />
                  ) : (
                    <IconButton
                      label={t('common.unarchive')}
                      icon={<ArchiveRestore className="size-4" />}
                      onClick={() => void run(() => api.put(`/api/characters/${c.id}/status`, { status: 'active' }))}
                    />
                  )}
                  <IconButton
                    label={t('common.delete')}
                    icon={<Trash2 className="size-4" />}
                    className="hover:text-danger"
                    onClick={() => {
                      if (window.confirm(t('characters.deleteConfirm', { name: c.name }))) {
                        void run(() => api.del(`/api/characters/${c.id}`), t('toast.deleted'));
                      }
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {project && <AddExistingModal open={adding} onClose={() => setAdding(false)} projectId={project.id} projectNames={projectNames} />}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t('characters.importTitle')}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('characters.importHelp')}</p>
          <Checkbox label={t('characters.importMemories')} checked={importOpts.memories} onChange={(v) => setImportOpts({ ...importOpts, memories: v })} />
          <Checkbox
            label={t('characters.importConversations')}
            checked={importOpts.conversations}
            onChange={(v) => setImportOpts({ ...importOpts, conversations: v })}
          />
          <Checkbox label={t('characters.importKnowledge')} checked={importOpts.knowledge} onChange={(v) => setImportOpts({ ...importOpts, knowledge: v })} />
          {project && <p className="text-xs text-muted">{t('characters.importIntoProject', { name: project.name })}</p>}
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
            <Button variant="primary" icon={<Upload className="size-4" />} loading={importing} onClick={() => fileRef.current?.click()}>
              {t('common.import')}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!exporting} onClose={() => setExporting(null)} title={`${t('characters.exportTitle')} — ${exporting?.name ?? ''}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('characters.exportHelp')}</p>
          <Checkbox label={t('characters.exportConversations')} checked={exportOpts.conversations} onChange={(v) => setExportOpts({ ...exportOpts, conversations: v })} />
          <Checkbox label={t('characters.exportKnowledge')} checked={exportOpts.knowledge} onChange={(v) => setExportOpts({ ...exportOpts, knowledge: v })} />
          <Checkbox label={t('characters.exportContextual')} checked={exportOpts.contextual} onChange={(v) => setExportOpts({ ...exportOpts, contextual: v })} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExporting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              icon={<Download className="size-4" />}
              onClick={() => {
                if (!exporting) return;
                const p = new URLSearchParams({
                  conversations: exportOpts.conversations ? '1' : '0',
                  contextual: exportOpts.contextual ? '1' : '0',
                  knowledge: exportOpts.knowledge ? '1' : '0',
                });
                downloadUrl(`/api/characters/${exporting.id}/export?${p}`);
                toast(t('toast.exported'), 'success');
                setExporting(null);
              }}
            >
              {t('common.export')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Aggiunge al progetto attivo un personaggio già esistente (stessa identità, nessuna copia). */
function AddExistingModal({
  open,
  onClose,
  projectId,
  projectNames,
}: {
  open: boolean;
  onClose(): void;
  projectId: string;
  projectNames: Map<string, string>;
}) {
  const { t } = useTranslation();
  const { data } = useCharacters('active');
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const [busy, setBusy] = useState<string | null>(null);
  const candidates = (data ?? []).filter((c) => !c.projectIds.includes(projectId));

  const add = async (c: CharacterSummary) => {
    setBusy(c.id);
    try {
      await api.post(`/api/projects/${projectId}/characters`, { characterId: c.id });
      toast(t('projects.added'), 'success');
      await invalidate('characters', 'character', 'projects');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('projects.addExisting')}>
      <p className="mb-3 text-sm text-muted">{t('projects.addExistingHelp')}</p>
      {!data ? (
        <Spinner />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted">{t('projects.noOtherCharacters')}</p>
      ) : (
        <ul className="flex max-h-96 flex-col divide-y divide-border overflow-auto rounded-md border border-border">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <Portrait name={c.name} src={c.portrait} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted">
                  {c.projectIds.length > 0
                    ? c.projectIds.map((id) => projectNames.get(id)).filter(Boolean).join(' · ')
                    : t('projects.none')}
                </div>
              </div>
              <Button size="sm" icon={<Plus className="size-4" />} disabled={busy === c.id} onClick={() => void add(c)}>
                {t('common.add')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
