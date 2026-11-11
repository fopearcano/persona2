/**
 * Costruzione McKee del personaggio (PERSONA 2, da CharBuild): sedici stazioni che seguono
 * CHARACTER di Robert McKee, con infografiche dal vivo, verifiche McKee, profilo e coach.
 *
 * La costruzione fa parte dell'identità canonica: si modifica una bozza e la si salva
 * esplicitamente (nuova versione nella cronologia). Il coach propone, l'autore applica.
 */
import type { CastMember, Character, CoachCastSuggestion, CoachUpdate } from '@persona/shared/client';
import {
  antagonismProfile,
  applyUpdates,
  characterChecks,
  characterMarkdown,
  choiceDepth,
  definingDimension,
  expectedSections,
  mckeeData,
  overallProgress,
  traitDensity,
  type CharacterBuild,
} from '@persona/shared/mckee';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, ChartPie, FileText, Info, Printer, Save, Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { qk, useBuildContext, useCharacter, useInvalidate } from '../api/hooks';
import { ChecksList } from '../components/mckee/Checks';
import { CoachPanel, type CoachRequest } from '../components/mckee/CoachPanel';
import { GuidePanel, GuideRail } from '../components/mckee/GuidePanel';
import { FieldView, fieldVisible, type FieldCtx } from '../components/mckee/Fields';
import { ProgressRing, StationBars, StationVisual, VizCard, type VizCtx } from '../components/mckee/Viz';
import { Badge, Button, Checkbox, cx, ErrorBox, Input, Segmented, Select, Spinner, useErrorText } from '../components/ui';
import {
  applyCapture,
  downloadText,
  identityDraftOf,
  slugify,
  storyOf,
  toMcKee,
  undoCapture,
  useMckee,
  type CaptureUndo,
  type IdentityDraft,
} from '../lib/mckee';
import { useUnsavedChanges } from '../lib/sync';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';
import { Portrait } from './CharactersPage';

const PROFILE = 'profile';

export function BuildPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const M = useMckee();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stationId = params.get('station') ?? 'spark';
  // Vista "chat": l'assistente costruisce il personaggio conversando (stessa API del coach, modalità guide).
  const chatView = params.get('view') === 'chat';
  const { projectId: activeProjectId } = useActiveProject();
  const [projectId, setProjectId] = useState<string | null>(params.get('project') ?? activeProjectId);
  const { data: character, isLoading, error } = useCharacter(id);
  const { data: bctx } = useBuildContext(id, projectId);
  const [draft, setDraft] = useState<CharacterBuild | null>(null);
  const [original, setOriginal] = useState<CharacterBuild | null>(null);
  // Campi dell'identità che l'assistente può compilare: salvati insieme alla costruzione.
  const [identity, setIdentity] = useState<IdentityDraft>({});
  const [identityOriginal, setIdentityOriginal] = useState<IdentityDraft>({});
  const [guideFocus, setGuideFocus] = useState<string | null>(null);
  const draftRef = useRef<CharacterBuild | null>(null);
  const identityRef = useRef<IdentityDraft>({});
  draftRef.current = draft;
  identityRef.current = identity;
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [request, setRequest] = useState<CoachRequest | null>(null);
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  useEffect(() => {
    if (character) {
      setDraft(character.build);
      setOriginal(character.build);
      setIdentity(identityDraftOf(character));
      setIdentityOriginal(identityDraftOf(character));
    }
  }, [character]);

  // Distillazione di una conversazione (dal Dialogo): apre il coach con la trascrizione.
  useEffect(() => {
    const distill = params.get('distill');
    if (!distill || !character) return;
    setCoachOpen(true);
    setRequest({ content: t('mckee.coach.distillPrompt'), transcriptConversationId: distill, nonce: Date.now() });
    setParams(
      (p) => {
        p.delete('distill');
        return p;
      },
      { replace: true },
    );
  }, [params, character, setParams, t]);

  const identityChanges = Object.fromEntries(Object.entries(identity).filter(([k, v]) => (v ?? '') !== (identityOriginal[k] ?? '')));
  const dirty = (!!draft && !!original && JSON.stringify(draft) !== JSON.stringify(original)) || Object.keys(identityChanges).length > 0;
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const edit = (fn: (d: CharacterBuild) => void) =>
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });

  const go = (station: string) => {
    setParams(
      (p) => {
        p.set('station', station);
        p.delete('view');
        return p;
      },
      { replace: true },
    );
    document.getElementById('main')?.scrollTo({ top: 0 });
  };
  const setView = (view: 'fields' | 'chat') =>
    setParams(
      (p) => {
        if (view === 'chat') {
          p.set('view', 'chat');
          if (p.get('station') === PROFILE) p.delete('station');
        } else p.delete('view');
        return p;
      },
      { replace: true },
    );

  /** Applica alla bozza ciò che l'assistente ha raccolto; restituisce come annullarlo. */
  const capture = (updates: CoachUpdate[]): CaptureUndo => {
    const r = applyCapture(draftRef.current!, identityRef.current, updates);
    draftRef.current = r.build;
    identityRef.current = r.identity;
    setDraft(r.build);
    setIdentity(r.identity);
    return r.undo;
  };
  const uncapture = (undo: CaptureUndo) => {
    const r = undoCapture(draftRef.current!, identityRef.current, undo);
    draftRef.current = r.build;
    identityRef.current = r.identity;
    setDraft(r.build);
    setIdentity(r.identity);
  };

  const save = async () => {
    if (!draft || !id) return;
    setSaving(true);
    try {
      const profile = Object.keys(identityChanges).length ? identityChanges : undefined;
      const updated = await api.put<Character>(`/api/characters/${id}/build`, { build: draft, profile, revisionReason: reason || null });
      qc.setQueryData(qk.character(id), updated);
      setReason('');
      toast(t('editor.savedVersion', { version: updated.identityVersion }), 'success');
      await invalidate('characters', 'character', 'projects');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || (character && !draft)) return <Spinner />;
  if (error || !character || !draft) return <div className="p-6">{error ? <ErrorBox error={error} /> : null}</div>;

  const story = storyOf(bctx);
  const cast: CastMember[] = bctx?.cast ?? [];
  const me = toMcKee({ id: character.id, name: character.name, build: draft });
  const mcCast = [me, ...cast.map(toMcKee)];
  const progress = overallProgress(me, story);
  const checks = characterChecks(me, story, mcCast, M.lang);
  const storyLink = bctx?.project ? (
    <Link to={`/story/${bctx.project.id}`} className="text-xs text-accent hover:underline">
      {t('mckee.build.editStory')} →
    </Link>
  ) : null;
  const fieldCtx: FieldCtx = { M, story, cast, storyLink };
  const vizCtx: VizCtx = {
    M,
    story,
    cast,
    onTurningPoint: (i, charge) =>
      edit((d) => {
        if (d.arc.turningPoints[i]) d.arc.turningPoints[i].charge = charge;
      }),
    onOpenCharacter: (cid) => navigate(`/characters/${cid}/build?station=relationships`),
  };

  const applyCoach = (updates: CoachUpdate[]) => setDraft((d) => (d ? applyUpdates(d, updates) : d));
  const addCast = async (member: CoachCastSuggestion) => {
    const created = await api.post<Character>('/api/characters', {
      name: member.name,
      projectId: bctx?.project?.id ?? null,
      build: {
        concept: { roleLabel: member.roleLabel, logline: member.logline },
        cast: { circle: member.circle, specialRoles: member.specialRoles },
        notes: [member.draws, member.reason].filter(Boolean).join('\n'),
      },
    });
    toast(t('mckee.coach.castAdded', { name: created.name }), 'success');
    await invalidate('characters', 'character', 'projects');
  };
  const askCoach = (content: string) => {
    setCoachOpen(true);
    setRequest({ content, nonce: Date.now() });
  };

  const exportMarkdown = () => {
    const md = characterMarkdown(me, story, mcCast, { lang: M.lang });
    downloadText(`persona-${slugify(character.name)}-mckee.md`, md);
  };

  const section = M.SECTION_BY_ID[stationId];
  const isProfile = !chatView && (stationId === PROFILE || !section);
  const displayName = identity.name?.trim() || character.name;

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 px-4 py-2.5 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/characters/${character.id}`} className="text-muted hover:text-text" aria-label={t('common.back')}>
            <ArrowLeft className="size-4" />
          </Link>
          <Portrait name={displayName} src={character.portrait} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{displayName}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span>{t('mckee.build.title')}</span>
              <span>·</span>
              <span>{t('characters.identityVersion', { version: character.identityVersion })}</span>
              {dirty && <Badge tone="warn">{t('common.unsaved')}</Badge>}
            </div>
          </div>
          <ProgressRing ratio={progress.ratio} size={36} label={M.t('{pct}% complete', { pct: Math.round(progress.ratio * 100) })} />
          {bctx && bctx.projects.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              {t('mckee.build.story')}
              <Select
                className="h-7! w-40! py-0! text-xs"
                value={bctx.project?.id ?? ''}
                onChange={(e) => {
                  setProjectId(e.target.value || null);
                  setParams(
                    (p) => {
                      p.set('project', e.target.value);
                      return p;
                    },
                    { replace: true },
                  );
                }}
              >
                {bctx.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <div title={t('mckee.build.useInContextHelp')}>
            <Checkbox label={<span className="text-xs">{t('mckee.build.useInContext')}</span>} checked={draft.useInContext} onChange={(v) => edit((d) => void (d.useInContext = v))} />
          </div>
          <Segmented<'fields' | 'chat'>
            label={t('mckee.guide.viewLabel')}
            value={chatView ? 'chat' : 'fields'}
            onChange={setView}
            options={[
              { id: 'fields', label: t('mckee.guide.viewFields') },
              { id: 'chat', label: t('mckee.guide.viewChat'), title: t('mckee.guide.viewChatHelp') },
            ]}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={isProfile ? 'primary' : 'secondary'} icon={<ChartPie className="size-3.5" />} onClick={() => go(isProfile ? 'spark' : PROFILE)}>
              {isProfile ? t('mckee.build.stations') : t('mckee.build.profile')}
            </Button>
            {!chatView && (
              <Button size="sm" variant={coachOpen ? 'primary' : 'secondary'} icon={<Sparkles className="size-3.5" />} onClick={() => setCoachOpen((o) => !o)}>
                {t('mckee.build.coach')}
              </Button>
            )}
            <Input className="h-7! w-56! text-xs" value={reason} placeholder={t('mckee.build.reason')} aria-label={t('mckee.build.reason')} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={saving} disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </header>

      {chatView ? (
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <GuidePanel
              characterId={character.id}
              name={displayName}
              draft={draft}
              identity={identity}
              projectId={bctx?.project?.id ?? null}
              focus={guideFocus}
              M={M}
              onCapture={capture}
              onUndo={uncapture}
            />
          </main>
          <aside aria-label={t('mckee.guide.progress')} className="hidden w-72 shrink-0 overflow-auto border-l border-border md:block print:hidden">
            <GuideRail draft={draft} identity={identity} characterId={character.id} story={story} focus={guideFocus} M={M} onFocus={setGuideFocus} onOpenFields={go} />
          </aside>
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        {!isProfile && (
          <nav aria-label={t('mckee.build.stations')} className="hidden w-56 shrink-0 overflow-auto border-r border-border p-2 lg:block print:hidden">
            {M.PARTS.map((part) => (
              <div key={part.id} className="mb-2">
                <h4 className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">{part.title}</h4>
                {M.SECTIONS.filter((s) => s.part === part.id).map((s) => {
                  const b = progress.bySection[s.id];
                  const active = s.id === stationId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(s.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2 hover:text-text',
                        !b.expected && 'opacity-60',
                      )}
                    >
                      <span className="w-5 font-mono text-[10px]">{s.num}</span>
                      <span className="flex-1 truncate">{s.title}</span>
                      <span className="h-1 w-8 overflow-hidden rounded-full bg-panel-2">
                        <span className="block h-full bg-accent" style={{ width: `${Math.round(b.ratio * 100)}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        )}

        <main className="min-w-0 flex-1 overflow-auto">
          {isProfile ? (
            <ProfileView c={me} vizCtx={vizCtx} checks={checks} go={go} onMarkdown={exportMarkdown} />
          ) : (
            <StationView
              key={section.id}
              sectionId={section.id}
              draft={draft}
              edit={edit}
              ctx={fieldCtx}
              go={go}
              expected={expectedSections(me).includes(section.id)}
              askCoach={askCoach}
              openBook={() => {
                setCoachOpen(true);
                setRequest({ content: '', book: mckeeData('en').SECTION_BY_ID[section.id].title, nonce: Date.now() });
              }}
            />
          )}
        </main>

        {!isProfile && (
          <aside
            aria-label={coachOpen ? t('mckee.coach.title') : t('mckee.build.live')}
            className={cx('hidden shrink-0 border-l border-border md:flex md:flex-col', coachOpen ? 'w-96' : 'w-80 overflow-auto xl:w-96', 'print:hidden')}
          >
            {coachOpen ? (
              <CoachPanel
                characterId={character.id}
                draft={draft}
                projectId={bctx?.project?.id ?? null}
                section={section?.id ?? null}
                M={M}
                request={request}
                onApply={applyCoach}
                onAddCast={addCast}
                onClose={() => setCoachOpen(false)}
              />
            ) : (
              <div className="flex flex-col gap-3 p-3">
                <StationVisual visual={section.visual} c={me} ctx={vizCtx} />
                <VizCard title={M.t('McKee checks')} sub={M.t('this station')}>
                  <ChecksList checks={checks.filter((x) => x.section === section.id)} empty={M.t('Nothing flagged here yet.')} />
                  {checks.some((x) => x.section !== section.id && x.level === 'warn') && (
                    <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => go(PROFILE)}>
                      {M.tn(
                        checks.filter((x) => x.section !== section.id && x.level === 'warn').length,
                        '{n} warning in other stations →',
                        '{n} warnings in other stations →',
                      )}
                    </button>
                  )}
                </VizCard>
              </div>
            )}
          </aside>
        )}
      </div>
      )}
      {/* Su schermi stretti il coach si apre sopra il contenuto. */}
      {coachOpen && !isProfile && !chatView && (
        <div className="fixed inset-0 z-40 flex flex-col bg-bg md:hidden">
          <CoachPanel
            characterId={character.id}
            draft={draft}
            projectId={bctx?.project?.id ?? null}
            section={section?.id ?? null}
            M={M}
            request={request}
            onApply={applyCoach}
            onAddCast={addCast}
            onClose={() => setCoachOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function StationView({
  sectionId,
  draft,
  edit,
  ctx,
  go,
  expected,
  askCoach,
  openBook,
}: {
  sectionId: string;
  draft: CharacterBuild;
  edit: (fn: (d: CharacterBuild) => void) => void;
  ctx: FieldCtx;
  go(id: string): void;
  expected: boolean;
  askCoach(content: string): void;
  openBook(): void;
}) {
  const { t } = useTranslation();
  const { M } = ctx;
  const section = M.SECTION_BY_ID[sectionId];
  const idx = M.SECTIONS.indexOf(section);
  const prev = M.SECTIONS[idx - 1];
  const next = M.SECTIONS[idx + 1];
  const part = M.PARTS.find((p) => p.id === section.part)!;
  const stationName = `${section.num} ${section.title}`;
  const circle = M.K.CIRCLES.find((x) => x.id === draft.cast.circle);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-5">
      <label className="lg:hidden">
        <span className="sr-only">{t('mckee.build.station')}</span>
        <Select value={sectionId} onChange={(e) => go(e.target.value)}>
          {M.SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.num} {s.title}
            </option>
          ))}
        </Select>
      </label>
      <header className="flex gap-4">
        <div className="font-mono text-4xl leading-none font-light text-accent" aria-hidden>
          {section.num}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] tracking-wide text-muted uppercase">
            {part.title} · {part.subtitle}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
          <p className="text-sm text-muted">{section.subtitle}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {section.chapters.map((n) => (
              <Badge key={n}>
                {M.t('Ch. {n}', { n })} · {M.K.CHAPTERS[n]}
              </Badge>
            ))}
          </div>
          {!expected && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Info className="size-3.5" aria-hidden />
              {M.t('Optional for a {circle} role — McKee keeps outer-circle roles lean.', { circle: circle?.label.toLowerCase() ?? M.t('minor') })}
            </p>
          )}
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 md:grid-cols-[3fr_2fr]">
        <div>
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
            <BookOpen className="size-3.5 text-accent" aria-hidden />
            {M.t('McKee’s principle')}
          </h3>
          <p className="font-text text-sm leading-relaxed">{section.principle}</p>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold">{M.t('Ask yourself')}</h4>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            {section.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => askCoach(t('mckee.coach.brainstormPrompt', { station: stationName }))}>
              {M.t('Brainstorm with coach')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => askCoach(t('mckee.coach.critiquePrompt', { station: stationName }))}>
              {M.t('Critique this station')}
            </Button>
            <Button size="sm" variant="ghost" icon={<BookOpen className="size-3.5" />} title={M.t('Search the original English text')} onClick={openBook}>
              {M.t('In the book')}
            </Button>
          </div>
        </div>
      </section>

      {section.groups
        .filter((g) => fieldVisible(g, draft, ctx.story))
        .map((g) => (
          <section key={g.title} className="rounded-lg border border-border bg-panel">
            <header className="border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">{g.title}</h3>
              {g.hint && <p className="mt-0.5 text-xs text-muted">{g.hint}</p>}
            </header>
            <div className="flex flex-col gap-3 p-4">
              {g.fields
                .filter((f) => fieldVisible(f, draft, ctx.story))
                .map((f, i) => (
                  <FieldView key={`${f.path}-${i}`} f={f} data={draft} edit={edit} ctx={ctx} build={draft} />
                ))}
            </div>
          </section>
        ))}

      <nav className="flex items-center justify-between gap-2 pb-6">
        {prev ? (
          <Button variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={() => go(prev.id)}>
            {prev.num} {prev.title}
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button variant="primary" onClick={() => go(next.id)}>
            {next.num} {next.title} <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button variant="primary" icon={<ChartPie className="size-3.5" />} onClick={() => go(PROFILE)}>
            {t('mckee.build.seeProfile')}
          </Button>
        )}
      </nav>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 text-center">
      <b className="text-lg">{value}</b>
      <span className="text-[11px] text-muted">{label}</span>
      {sub && <small className="text-[10px] text-muted">{sub}</small>}
    </div>
  );
}

function ProfileView({
  c,
  vizCtx,
  checks,
  go,
  onMarkdown,
}: {
  c: ReturnType<typeof toMcKee>;
  vizCtx: VizCtx;
  checks: ReturnType<typeof characterChecks>;
  go(id: string): void;
  onMarkdown(): void;
}) {
  const { t } = useTranslation();
  const { M } = vizCtx;
  const p = overallProgress(c, vizCtx.story);
  const td = traitDensity(c);
  const ap = antagonismProfile(c);
  const cd = choiceDepth(c);
  const def = definingDimension(c);
  const circle = M.K.CIRCLES.find((x) => x.id === c.cast.circle);
  const staticCtx = useMemo(() => ({ ...vizCtx, onTurningPoint: undefined }), [vizCtx]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5">
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-panel p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-wide text-muted uppercase">
            {circle?.label ?? M.t('Unplaced')}
            {c.concept.roleLabel ? ` · ${c.concept.roleLabel}` : ''}
            {vizCtx.story ? ` · ${vizCtx.story.title}` : ''}
          </p>
          <h2 className="text-xl font-semibold">{c.name}</h2>
          {c.concept.nickname && <p className="text-sm text-muted">“{c.concept.nickname}”</p>}
          {c.concept.logline && <p className="mt-1 font-text text-sm">{c.concept.logline}</p>}
        </div>
        <div className="flex flex-wrap items-center divide-x divide-border">
          <div className="flex flex-col items-center px-2">
            <ProgressRing ratio={p.ratio} size={52} label={M.t('{pct}% complete', { pct: Math.round(p.ratio * 100) })} />
            <span className="text-[11px] text-muted">{M.t('built')}</span>
          </div>
          <Stat label={M.t('dimensions')} value={c.dimensions.length} sub={def ? `${def.positive} / ${def.negative}` : undefined} />
          <Stat label={M.t('traits on page')} value={`${td.expressed}/${td.known}`} sub={td.known ? M.t('{pct}% · ideal ≈30%', { pct: Math.round(td.expressedRatio * 100) }) : undefined} />
          <Stat
            label={M.t('underdog')}
            value={ap.capacity == null ? '—' : ap.underdog ? M.t('Yes') : M.t('No')}
            sub={ap.capacity == null ? undefined : M.t('{power} vs {capacity}', { power: ap.power, capacity: ap.capacity })}
          />
          <Stat label={M.t('choice depth')} value={cd ?? '—'} sub={cd != null ? '/10' : undefined} />
        </div>
        <div className="flex gap-1.5 print:hidden">
          <Button size="sm" icon={<FileText className="size-3.5" />} onClick={onMarkdown}>
            Markdown
          </Button>
          <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
            {t('mckee.build.print')}
          </Button>
        </div>
      </section>
      <VizCard title={M.t('Sixteen stations')} sub={M.t('click a bar to open it')}>
        <StationBars c={c} ctx={vizCtx} onOpen={go} />
      </VizCard>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {['dimensionWheel', 'fourSelves', 'bigFive', 'motivationLadder', 'underdogScale', 'arcChart', 'choiceDepth', 'traitDensity', 'symbolicSpectrum', 'performanceStar', 'relationshipWeb'].map((v) => (
          <div key={v} className="flex flex-col gap-3">
            <StationVisual visual={v} c={c} ctx={staticCtx} />
          </div>
        ))}
        <VizCard
          title={M.t('McKee checks')}
          sub={`${M.tn(checks.filter((x) => x.level === 'warn').length, '{n} warning', '{n} warnings')} · ${M.tn(checks.filter((x) => x.level === 'tip').length, '{n} tip', '{n} tips')}`}
        >
          <ChecksList checks={checks} empty={M.t('No issues found.')} onOpen={go} />
        </VizCard>
      </div>
    </div>
  );
}
