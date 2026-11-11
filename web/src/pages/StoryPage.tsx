/**
 * Storia e cast (PERSONA 2): impianto narrativo McKee di un progetto (genere, tema, valori,
 * mondo) e mappa del cast, con le verifiche del cast e le schede di genere.
 * L'impianto è un dato del progetto (non dell'identità); le orbite sono delle costruzioni.
 */
import type { Project } from '@persona/shared/client';
import { castChecks, normalizeStoryDesign, overallProgress, storyMarkdown, type StoryDesign } from '@persona/shared/mckee';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Hammer, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { qk, useInvalidate, useProjectCast, useProjects } from '../api/hooks';
import { CastMap } from '../components/mckee/CastMap';
import { ChecksList } from '../components/mckee/Checks';
import { FieldView, type FieldCtx } from '../components/mckee/Fields';
import { GenreSheets, ProgressRing, VizCard } from '../components/mckee/Viz';
import { Badge, Button, EmptyState, PageHeader, Select, Spinner, useErrorText } from '../components/ui';
import { downloadText, slugify, toMcKee, useMckee } from '../lib/mckee';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';
import { Portrait } from './CharactersPage';
import { useUnsavedChanges } from '../lib/sync';

export function StoryPage() {
  const { projectId: routeId } = useParams();
  const { t } = useTranslation();
  const M = useMckee();
  const navigate = useNavigate();
  const { projectId: activeId, setActive } = useActiveProject();
  const { data: projects, isLoading } = useProjects();
  const projectId = routeId ?? activeId ?? projects?.find((p) => p.status === 'active')?.id ?? null;
  const project = projects?.find((p) => p.id === projectId) ?? null;
  const { data: cast } = useProjectCast(project?.id);
  const [draft, setDraft] = useState<StoryDesign | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  useEffect(() => {
    setDraft(project ? normalizeStoryDesign(project.story) : null);
  }, [project]);
  useUnsavedChanges(!!project && !!draft && JSON.stringify(draft) !== JSON.stringify(normalizeStoryDesign(project.story)));

  if (isLoading) return <Spinner />;
  if (!projects?.length) {
    return (
      <div>
        <PageHeader title={t('mckee.story.title')} subtitle={t('mckee.story.subtitle')} />
        <div className="p-6">
          <EmptyState action={<Link to="/projects" className="text-sm text-accent hover:underline">{t('nav.projects')}</Link>}>{t('mckee.story.noProjects')}</EmptyState>
        </div>
      </div>
    );
  }
  if (!project || !draft) return <Spinner />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(normalizeStoryDesign(project.story));
  const edit = (fn: (d: StoryDesign) => void) =>
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });
  const story = { ...draft, id: project.id, title: project.name };
  const members = cast ?? [];
  const mcCast = members.map(toMcKee);
  const checks = castChecks(story, mcCast, M.lang);
  const fieldCtx: FieldCtx = { M, story: draft, cast: members };
  const order: Record<string, number> = { protagonist: 0, first: 1, second: 2, third: 3 };
  const sorted = [...members].sort((a, b) => (order[a.build.cast.circle] ?? 4) - (order[b.build.cast.circle] ?? 4));

  const save = async () => {
    setSaving(true);
    try {
      await api.put<Project>(`/api/projects/${project.id}`, { name: project.name, description: project.description, status: project.status, story: draft });
      toast(t('mckee.story.saved'), 'success');
      await invalidate('projects');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const move = async (id: string, circle: string, angle: number) => {
    try {
      await api.put(`/api/characters/${id}/cast`, { circle, angle });
      await qc.invalidateQueries({ queryKey: qk.projectCast(project.id) });
      await invalidate('character', 'characters');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {project.name}
            {dirty && <Badge tone="warn">{t('common.unsaved')}</Badge>}
          </span>
        }
        subtitle={t('mckee.story.subtitle')}
        actions={
          <>
            <Select
              aria-label={t('projects.switcher')}
              className="h-8 w-48!"
              value={project.id}
              onChange={(e) => {
                setActive(e.target.value);
                navigate(`/story/${e.target.value}`);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button icon={<FileText className="size-3.5" />} onClick={() => downloadText(`persona-${slugify(project.name)}-mckee.md`, storyMarkdown(story, mcCast, { lang: M.lang }))}>
              Markdown
            </Button>
            <Button variant="primary" icon={<Save className="size-3.5" />} loading={saving} disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-5">
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <VizCard title={M.t('Cast map')} sub={M.t('Drag characters between orbits · click to open · Ch. 6, 17')}>
            <CastMap cast={members} M={M} title={project.name} onMove={move} onOpen={(id) => navigate(`/characters/${id}/build?project=${project.id}`)} />
          </VizCard>
          <div className="flex flex-col gap-3">
            <VizCard title={M.t('Cast design checks')}>
              <ChecksList checks={checks} empty={M.t('No cast-level issues found.')} />
            </VizCard>
            <GenreSheets ctx={{ M, story: draft, cast: members }} cast={members.map((m) => ({ name: m.name, role: m.build.genre.coreCastRole }))} />
          </div>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold">{M.t('Cast')}</h2>
          {sorted.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((m) => {
                const p = overallProgress(toMcKee(m), draft);
                const circle = M.K.CIRCLES.find((c) => c.id === m.build.cast.circle);
                return (
                  <Link key={m.id} to={`/characters/${m.id}/build?project=${project.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3 hover:border-muted">
                    <Portrait name={m.name} src={m.portrait} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted">
                        {circle?.label ?? M.t('Unplaced')}
                        {m.build.concept.roleLabel ? ` · ${m.build.concept.roleLabel}` : ''}
                      </p>
                    </div>
                    <ProgressRing ratio={p.ratio} size={34} label={M.t('{pct}% complete', { pct: Math.round(p.ratio * 100) })} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState action={<Link to="/characters/new" className="text-sm text-accent hover:underline">{t('characters.new')}</Link>}>{t('characters.emptyProject')}</EmptyState>
          )}
        </section>

        <section className="rounded-lg border border-border bg-panel">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Hammer className="size-4 text-accent" aria-hidden />
            <h2 className="text-sm font-semibold">{M.t('Story settings')}</h2>
          </header>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {M.STORY_FIELDS.map((f) => (
              <div key={f.path} className={f.type === 'custom' || f.type === 'textarea' ? 'md:col-span-2' : undefined}>
                <FieldView f={f} data={draft} edit={edit} ctx={fieldCtx} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
