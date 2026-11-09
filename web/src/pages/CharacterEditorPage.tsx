import type { BigFive, Character, CharacterSnapshot, ExpertiseLevel, KnowledgeHit, KnowledgeSource, PdfExtraction, ProficiencyLevel, TraitCategory } from '@persona/shared/client';
import { EPISTEMIC_STATUSES, EXPERTISE_LEVELS, PROFICIENCY_LEVELS } from '@persona/shared/client';
import { ArrowLeft, GitBranch, History, MessagesSquare, Plus, RotateCcw, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { qk, useCharacter, useInvalidate, useKnowledge, useModelConfigs, useRevisions, useVariants } from '../api/hooks';
import { LanguageSelect } from '../components/LanguageSelect';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBox,
  Field,
  IconButton,
  Input,
  Select,
  Spinner,
  Tabs,
  Textarea,
  TextField,
  useErrorText,
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useActiveProject, useRemoveFromProject } from '../lib/project';
import { useUi } from '../stores/ui';
import { Portrait } from './CharactersPage';
import { useQueryClient } from '@tanstack/react-query';

type TabId = 'identity' | 'psychology' | 'communication' | 'expertise' | 'languages' | 'knowledge' | 'model' | 'history';
type Draft = CharacterSnapshot;

const TEXT_KEYS = [
  'age',
  'origin',
  'culturalBackground',
  'occupation',
  'education',
  'biography',
  'appearance',
  'portrait',
  'temperament',
  'interpersonalStyle',
  'conflictResponse',
  'stressResponse',
  'register',
  'vocabulary',
  'formality',
  'humor',
  'assertiveness',
  'argumentativeStyle',
  'conversationalDepth',
  'culturalLinguisticNotes',
  'preferredLanguage',
  'authorNotes',
] as const;

function emptyDraft(): Draft {
  const d: Record<string, unknown> = { name: '', bigFive: null, traits: [], languages: [], expertise: [] };
  for (const k of TEXT_KEYS) d[k] = null;
  return d as unknown as Draft;
}

function draftFrom(c: Character): Draft {
  const d: Record<string, unknown> = { name: c.name, bigFive: c.bigFive };
  for (const k of TEXT_KEYS) d[k] = c[k];
  d.traits = c.traits.map((t, i) => ({ category: t.category, content: t.content, sortOrder: i }));
  d.languages = c.languages.map((l, i) => ({ code: l.code, proficiency: l.proficiency, isNative: l.isNative, notes: l.notes, sortOrder: i }));
  d.expertise = c.expertise.map((e, i) => ({ domain: e.domain, level: e.level, description: e.description, subtopics: e.subtopics, sortOrder: i }));
  return d as unknown as Draft;
}

const norm = (d: Draft) => JSON.stringify({ ...d, ...Object.fromEntries(TEXT_KEYS.map((k) => [k, (d[k] as string | null) || null])) });

async function resizeImage(file: File, max = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CharacterEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'identity';
  const setTab = (v: TabId) => setParams((p) => (p.set('tab', v), p), { replace: true });
  const { data: character, isLoading, error } = useCharacter(id);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [original, setOriginal] = useState<Draft>(emptyDraft);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const toast = useUi((s) => s.toast);
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { projectId: activeProjectId } = useActiveProject();
  // Progetto in cui nasce un nuovo personaggio (non fa parte dell'identità).
  const [newProjectId, setNewProjectId] = useState<string>(activeProjectId ?? '');

  useEffect(() => {
    if (character) {
      const d = draftFrom(character);
      setDraft(d);
      setOriginal(d);
    }
  }, [character]);

  const dirty = norm(draft) !== norm(original);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const text = (k: (typeof TEXT_KEYS)[number]) => ({ value: draft[k] as string | null, onChange: (v: string) => set(k, v as never) });

  const save = async () => {
    if (!draft.name.trim()) {
      setSaveError({ code: 'validation', message: t('editor.nameRequired') });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = { ...draft, modelConfigId: character?.modelConfigId ?? null, revisionReason: reason || null };
      if (isNew) {
        const created = await api.post<Character>('/api/characters', { ...body, projectId: newProjectId || null });
        toast(t('editor.createdToast'), 'success');
        setOriginal(draft);
        await invalidate('characters', 'projects');
        navigate(`/characters/${created.id}?tab=${tab}`, { replace: true });
      } else {
        const updated = await api.put<Character>(`/api/characters/${id}`, body);
        qc.setQueryData(qk.character(id), updated);
        setReason('');
        toast(t('editor.savedVersion', { version: updated.identityVersion }), 'success');
        await invalidate('characters', 'character');
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && isLoading) return <Spinner />;
  if (!isNew && error) return <div className="p-6"><ErrorBox error={error} /></div>;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'identity', label: t('editor.tabs.identity') },
    { id: 'psychology', label: t('editor.tabs.psychology') },
    { id: 'communication', label: t('editor.tabs.communication') },
    { id: 'expertise', label: t('editor.tabs.expertise') },
    { id: 'languages', label: t('editor.tabs.languages') },
    { id: 'knowledge', label: t('editor.tabs.knowledge') },
    { id: 'model', label: t('editor.tabs.model') },
    { id: 'history', label: t('editor.tabs.history') },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-bg/95 px-6 pt-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/characters" className="text-muted hover:text-text" aria-label={t('common.back')}>
            <ArrowLeft className="size-4" />
          </Link>
          <Portrait name={draft.name || '?'} src={draft.portrait} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{isNew ? t('editor.newTitle') : draft.name || character?.name}</h1>
            {character && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{t('characters.identityVersion', { version: character.identityVersion })}</span>
                {character.parentId && (
                  <Badge tone="accent">
                    <GitBranch className="size-3" aria-hidden /> {t('characters.variant')}
                  </Badge>
                )}
                {dirty && <Badge tone="warn">{t('common.unsaved')}</Badge>}
              </div>
            )}
          </div>
          {!isNew && (
            <>
              <Input className="w-64" placeholder={t('editor.revisionReason')} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('editor.revisionReason')} />
              <Button icon={<MessagesSquare className="size-4" />} onClick={() => navigate(`/dialogue/${id}`)}>
                {t('characters.talk')}
              </Button>
            </>
          )}
          <Button variant="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty && !isNew} onClick={() => void save()}>
            {isNew ? t('common.create') : t('common.save')}
          </Button>
        </div>
        {saveError != null && <div className="mt-2"><ErrorBox error={saveError} /></div>}
        <p className="mt-2 text-xs text-muted">{t('editor.identityNote')}</p>
        {isNew ? <NewProjectSelect value={newProjectId} onChange={setNewProjectId} /> : character && <ProjectMembership character={character} />}
        <Tabs className="mt-2" tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-5">
        {tab === 'identity' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label={t('editor.fields.name')} value={draft.name} onChange={(v) => set('name', v)} />
            <TextField label={t('editor.fields.age')} help={t('editor.help.age')} {...text('age')} />
            <TextField label={t('editor.fields.origin')} {...text('origin')} />
            <TextField label={t('editor.fields.occupation')} {...text('occupation')} />
            <TextField label={t('editor.fields.culturalBackground')} multiline {...text('culturalBackground')} />
            <TextField label={t('editor.fields.education')} multiline {...text('education')} />
            <TextField className="md:col-span-2" label={t('editor.fields.biography')} help={t('editor.help.biography')} multiline rows={10} {...text('biography')} />
            <TextField label={t('editor.fields.appearance')} multiline rows={4} {...text('appearance')} />
            <PortraitField value={draft.portrait} onChange={(v) => set('portrait', v)} />
            <TextField className="md:col-span-2" label={t('editor.fields.authorNotes')} help={t('editor.help.authorNotes')} multiline {...text('authorNotes')} />
          </div>
        )}

        {tab === 'psychology' && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted">{t('editor.help.psychology')}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(['personality', 'motivation', 'value', 'desire', 'fear', 'bias', 'contradiction'] as TraitCategory[]).map((cat) => (
                <TraitList key={cat} category={cat} draft={draft} setDraft={setDraft} />
              ))}
              <TextField label={t('editor.fields.temperament')} multiline {...text('temperament')} />
              <TextField label={t('editor.fields.interpersonalStyle')} multiline {...text('interpersonalStyle')} />
              <TextField label={t('editor.fields.conflictResponse')} multiline {...text('conflictResponse')} />
              <TextField label={t('editor.fields.stressResponse')} multiline {...text('stressResponse')} />
            </div>
            <BigFiveEditor value={draft.bigFive} onChange={(v) => set('bigFive', v)} />
          </div>
        )}

        {tab === 'communication' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label={t('editor.fields.register')} multiline {...text('register')} />
            <TextField label={t('editor.fields.vocabulary')} multiline {...text('vocabulary')} />
            <TextField label={t('editor.fields.formality')} {...text('formality')} />
            <TextField label={t('editor.fields.humor')} {...text('humor')} />
            <TextField label={t('editor.fields.assertiveness')} {...text('assertiveness')} />
            <TextField label={t('editor.fields.conversationalDepth')} {...text('conversationalDepth')} />
            <TextField label={t('editor.fields.argumentativeStyle')} multiline {...text('argumentativeStyle')} />
            <TextField label={t('editor.fields.culturalLinguisticNotes')} multiline {...text('culturalLinguisticNotes')} />
            <TraitList category="expression" draft={draft} setDraft={setDraft} />
          </div>
        )}

        {tab === 'expertise' && <ExpertiseEditor draft={draft} setDraft={setDraft} />}
        {tab === 'languages' && <LanguagesEditor draft={draft} setDraft={setDraft} />}
        {tab === 'knowledge' && (id ? <KnowledgePanel characterId={id} /> : <EmptyState>{t('editor.knowledge.saveFirst')}</EmptyState>)}
        {tab === 'model' && (character ? <ModelPanel character={character} /> : <EmptyState>{t('editor.model.saveFirst')}</EmptyState>)}
        {tab === 'history' && (character ? <HistoryPanel character={character} /> : <EmptyState>{t('editor.model.saveFirst')}</EmptyState>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PortraitField({ value, onChange }: { value: string | null; onChange(v: string | null): void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const toast = useUi((s) => s.toast);
  return (
    <Field group label={t('editor.fields.portrait')}>
      <div className="flex items-center gap-3">
        <Portrait name="?" src={value} size="lg" />
        <div className="flex flex-col gap-1.5">
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 20 * 1024 * 1024) return toast(t('editor.portraitTooLarge'), 'error');
              onChange(await resizeImage(f));
            }}
          />
          <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => ref.current?.click()}>
            {t('editor.portraitUpload')}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              {t('editor.portraitRemove')}
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}

function TraitList({ category, draft, setDraft }: { category: TraitCategory; draft: Draft; setDraft(fn: (d: Draft) => Draft): void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const items = draft.traits.map((tr, idx) => ({ ...tr, idx })).filter((tr) => tr.category === category);
  const add = () => {
    const v = input.trim();
    if (!v) return;
    setDraft((d) => ({ ...d, traits: [...d.traits, { category, content: v, sortOrder: d.traits.length }] }));
    setInput('');
  };
  return (
    <Field group label={t(`enums.traitCategory.${category}`)}>
      <ul className="flex flex-col gap-1">
        {items.map((it) => (
          <li key={it.idx} className="flex items-center gap-1">
            <Input
              value={it.content}
              aria-label={t(`enums.traitCategory.${category}`)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, traits: d.traits.map((x, i) => (i === it.idx ? { ...x, content: e.target.value } : x)) }))
              }
            />
            <IconButton
              label={t('common.remove')}
              icon={<X className="size-3.5" />}
              onClick={() => setDraft((d) => ({ ...d, traits: d.traits.filter((_, i) => i !== it.idx) }))}
            />
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <Input
          value={input}
          placeholder={t('editor.listPlaceholder')}
          aria-label={`${t('editor.listAdd')}: ${t(`enums.traitCategory.${category}`)}`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <IconButton label={t('editor.listAdd')} icon={<Plus className="size-4" />} onClick={add} />
      </div>
    </Field>
  );
}

const BF_KEYS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const;

function BigFiveEditor({ value, onChange }: { value: BigFive | null; onChange(v: BigFive | null): void }) {
  const { t } = useTranslation();
  const v: BigFive = value ?? { openness: null, conscientiousness: null, extraversion: null, agreeableness: null, neuroticism: null };
  return (
    <Card title={t('editor.bigFive.title')}>
      <p className="mb-3 text-xs text-muted">{t('editor.bigFive.help')}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {BF_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-3">
            <Checkbox
              label={<span className="w-36 text-sm">{t(`editor.bigFive.${k}`)}</span>}
              checked={v[k] != null}
              onChange={(on) => onChange({ ...v, [k]: on ? 50 : null })}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={v[k] == null}
              aria-label={t(`editor.bigFive.${k}`)}
              value={v[k] ?? 50}
              onChange={(e) => onChange({ ...v, [k]: Number(e.target.value) })}
              className="flex-1 accent-[var(--accent)] disabled:opacity-30"
            />
            <span className="w-20 text-right font-mono text-xs text-muted">{v[k] ?? t('editor.bigFive.unset')}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExpertiseEditor({ draft, setDraft }: { draft: Draft; setDraft(fn: (d: Draft) => Draft): void }) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<Draft['expertise'][number]>) =>
    setDraft((d) => ({ ...d, expertise: d.expertise.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-border bg-panel p-3 text-sm text-muted">{t('editor.expertise.help')}</p>
      {draft.expertise.length === 0 && <EmptyState>{t('editor.expertise.empty')}</EmptyState>}
      {draft.expertise.map((e, i) => (
        <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-panel p-4 md:grid-cols-[2fr_1fr_auto]">
          <TextField label={t('editor.expertise.domain')} value={e.domain} onChange={(v) => update(i, { domain: v })} />
          <Field label={t('editor.expertise.level')}>
            <Select value={e.level} onChange={(ev) => update(i, { level: ev.target.value as ExpertiseLevel })}>
              {EXPERTISE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`enums.expertiseLevel.${l}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <IconButton
              label={t('common.remove')}
              icon={<Trash2 className="size-4" />}
              onClick={() => setDraft((d) => ({ ...d, expertise: d.expertise.filter((_, j) => j !== i) }))}
            />
          </div>
          <TextField className="md:col-span-3" label={t('editor.expertise.description')} multiline value={e.description} onChange={(v) => update(i, { description: v })} />
          <TextField
            className="md:col-span-3"
            label={t('editor.expertise.subtopics')}
            value={e.subtopics.join(', ')}
            onChange={(v) => update(i, { subtopics: v.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      ))}
      <div>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() =>
            setDraft((d) => ({ ...d, expertise: [...d.expertise, { domain: '', level: 'competent', description: null, subtopics: [], sortOrder: d.expertise.length }] }))
          }
        >
          {t('editor.expertise.add')}
        </Button>
      </div>
    </div>
  );
}

function LanguagesEditor({ draft, setDraft }: { draft: Draft; setDraft(fn: (d: Draft) => Draft): void }) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<Draft['languages'][number]>) =>
    setDraft((d) => ({ ...d, languages: d.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('editor.languages.help')}</p>
      {draft.languages.length === 0 && <EmptyState>{t('editor.languages.empty')}</EmptyState>}
      {draft.languages.map((l, i) => (
        <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border bg-panel p-4 md:grid-cols-[2fr_1.2fr_auto_auto]">
          <Field label={t('editor.languages.code')}>
            <LanguageSelect value={l.code} onChange={(v) => v && update(i, { code: v })} ariaLabel={t('editor.languages.code')} />
          </Field>
          <Field label={t('editor.languages.proficiency')}>
            <Select
              value={l.isNative ? 'native' : l.proficiency}
              disabled={l.isNative}
              onChange={(e) => update(i, { proficiency: e.target.value as ProficiencyLevel })}
            >
              {PROFICIENCY_LEVELS.map((p) => (
                <option key={p} value={p}>
                  {t(`enums.proficiency.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="pb-1.5">
            <Checkbox
              label={t('editor.languages.native')}
              checked={l.isNative}
              onChange={(v) => update(i, { isNative: v, proficiency: v ? 'native' : l.proficiency === 'native' ? 'fluent' : l.proficiency })}
            />
          </div>
          <IconButton
            label={t('common.remove')}
            icon={<Trash2 className="size-4" />}
            onClick={() => setDraft((d) => ({ ...d, languages: d.languages.filter((_, j) => j !== i) }))}
          />
          <TextField className="md:col-span-4" label={t('editor.languages.notes')} value={l.notes} onChange={(v) => update(i, { notes: v })} />
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-4">
        <Button
          icon={<Plus className="size-4" />}
          onClick={() =>
            setDraft((d) => ({
              ...d,
              languages: [...d.languages, { code: 'en', proficiency: d.languages.length ? 'fluent' : 'native', isNative: d.languages.length === 0, notes: null, sortOrder: d.languages.length }],
            }))
          }
        >
          {t('editor.languages.add')}
        </Button>
        <Field label={t('editor.fields.preferredLanguage')} className="w-72">
          <LanguageSelect
            value={draft.preferredLanguage}
            allowNone
            noneLabel={t('editor.languages.preferredNone')}
            onChange={(v) => setDraft((d) => ({ ...d, preferredLanguage: v }))}
            ariaLabel={t('editor.fields.preferredLanguage')}
          />
        </Field>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Base di conoscenza                                                  */
/* ------------------------------------------------------------------ */

type SourceDraft = Pick<KnowledgeSource, 'title' | 'kind' | 'content' | 'sourceRef' | 'epistemicStatus' | 'language' | 'enabled'>;
const emptySource: SourceDraft = { title: '', kind: 'text', content: '', sourceRef: null, epistemicStatus: 'fact', language: null, enabled: true };

function KnowledgePanel({ characterId }: { characterId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useKnowledge(characterId);
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const [editing, setEditing] = useState<{ id: string | null; draft: SourceDraft } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await api.put(`/api/knowledge/${editing.id}`, editing.draft);
      else await api.post(`/api/characters/${characterId}/knowledge`, editing.draft);
      setEditing(null);
      toast(t('toast.saved'), 'success');
      await invalidate('character');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-border bg-panel p-3 text-sm text-muted">
        {t('editor.knowledge.help')} {t('editor.knowledge.pdfNote')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ id: null, draft: { ...emptySource } })}>
          {t('editor.knowledge.add')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
              try {
                const pdf = await api.upload<PdfExtraction>(`/api/knowledge/extract-pdf?filename=${encodeURIComponent(f.name)}`, f);
                setEditing({ id: null, draft: { ...emptySource, title: pdf.title, kind: 'text', content: pdf.text, sourceRef: f.name } });
                toast(t('editor.knowledge.pdfExtracted', { count: pdf.pages }), 'success');
              } catch (err) {
                toast(errorText(err), 'error');
              }
              return;
            }
            const content = await f.text();
            setEditing({
              id: null,
              draft: { ...emptySource, title: f.name.replace(/\.[^.]+$/, ''), kind: /\.(md|markdown)$/i.test(f.name) ? 'markdown' : 'text', content },
            });
          }}
        />
        <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
          {t('editor.knowledge.uploadFile')}
        </Button>
      </div>

      {editing && (
        <Card title={editing.id ? t('common.edit') : t('editor.knowledge.add')}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <TextField className="md:col-span-2" label={t('editor.knowledge.sourceTitle')} value={editing.draft.title} onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, title: v } })} />
            <Field label={t('editor.knowledge.kind')}>
              <Select value={editing.draft.kind} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, kind: e.target.value as SourceDraft['kind'] } })}>
                {(['text', 'markdown', 'note'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`enums.knowledgeKind.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <TextField label={t('editor.knowledge.sourceRef')} value={editing.draft.sourceRef} onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, sourceRef: v || null } })} />
            <Field label={t('editor.knowledge.epistemic')}>
              <Select
                value={editing.draft.epistemicStatus}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, epistemicStatus: e.target.value as SourceDraft['epistemicStatus'] } })}
              >
                {EPISTEMIC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`enums.epistemic.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.language')}>
              <LanguageSelect value={editing.draft.language} allowNone onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, language: v } })} />
            </Field>
            <Field label={t('editor.knowledge.content')} className="md:col-span-3">
              <Textarea rows={12} value={editing.draft.content} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, content: e.target.value } })} />
            </Field>
            <div className="flex items-center justify-between md:col-span-3">
              <Checkbox label={t('editor.knowledge.enabled')} checked={editing.draft.enabled} onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, enabled: v } })} />
              <div className="flex gap-2">
                <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                <Button variant="primary" disabled={!editing.draft.title.trim() || !editing.draft.content.trim()} onClick={() => void save()}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isLoading && <Spinner />}
      {error && <ErrorBox error={error} />}
      {data?.length === 0 && !editing && <EmptyState>{t('editor.knowledge.empty')}</EmptyState>}
      <ul className="flex flex-col gap-2">
        {data?.map((s) => (
          <li key={s.id} className="flex items-start gap-3 rounded-lg border border-border bg-panel p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{s.title}</span>
                <Badge>{t(`enums.knowledgeKind.${s.kind}`)}</Badge>
                <Badge tone={s.epistemicStatus === 'fact' ? 'ok' : s.epistemicStatus === 'fiction' ? 'narration' : 'warn'}>{t(`enums.epistemic.${s.epistemicStatus}`)}</Badge>
                <Badge>{t('editor.knowledge.chunks', { count: s.chunkCount })}</Badge>
                {!s.enabled && <Badge tone="danger">{t('enums.memoryStatus.archived')}</Badge>}
              </div>
              {s.sourceRef && <div className="truncate text-xs text-muted">{s.sourceRef}</div>}
              <p className="mt-1 line-clamp-2 text-sm text-muted">{s.content}</p>
            </div>
            <div className="flex">
              <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, draft: { ...s } })}>
                {t('common.edit')}
              </Button>
              <IconButton
                label={t('common.delete')}
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!window.confirm(t('common.deleteConfirmGeneric'))) return;
                  await api.del(`/api/knowledge/${s.id}`);
                  await invalidate('character');
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <Card title={t('editor.knowledge.searchTest')}>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setHits(await api.get<KnowledgeHit[]>(`/api/characters/${characterId}/knowledge/search?q=${encodeURIComponent(q)}`));
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('editor.knowledge.searchPlaceholder')} aria-label={t('editor.knowledge.searchTest')} />
          <Button type="submit" icon={<Search className="size-4" />}>
            {t('common.search')}
          </Button>
        </form>
        {hits && (
          <ul className="mt-3 flex flex-col gap-2">
            {hits.length === 0 && <li className="text-sm text-muted">{t('common.noResults')}</li>}
            {hits.map((h) => (
              <li key={h.chunkId} className="rounded border border-border p-2 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-text">{h.title}</span>
                  <span className="font-mono">{h.score.toFixed(2)}</span>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap">{h.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ModelPanel({ character }: { character: Character }) {
  const { t } = useTranslation();
  const { data: configs } = useModelConfigs();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const qc = useQueryClient();
  const def = configs?.find((c) => c.isDefault);
  return (
    <Card title={t('editor.model.title')}>
      <p className="mb-3 text-sm text-muted">{t('editor.model.help')}</p>
      <Select
        className="max-w-md"
        aria-label={t('editor.model.title')}
        value={character.modelConfigId ?? ''}
        onChange={async (e) => {
          try {
            const updated = await api.put<Character>(`/api/characters/${character.id}/model`, { modelConfigId: e.target.value || null });
            qc.setQueryData(qk.character(character.id), updated);
            toast(t('editor.model.applied'), 'success');
          } catch (err) {
            toast(errorText(err), 'error');
          }
        }}
      >
        <option value="">{t('editor.model.useDefault', { name: def?.name ?? '—' })}</option>
        {configs?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {t(`enums.provider.${c.providerType}`)}
            {c.model ? ` · ${c.model}` : ''}
          </option>
        ))}
      </Select>
    </Card>
  );
}

function HistoryPanel({ character }: { character: Character }) {
  const { t } = useTranslation();
  const { data: revisions } = useRevisions(character.id);
  const { data: variants } = useVariants(character.id);
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [variant, setVariant] = useState({ name: `${character.name} (variante)`, variantNote: '', copyMemories: 'core' as 'none' | 'core' | 'personal' });

  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex gap-2 text-sm">
      <span className="w-40 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 font-mono text-xs break-all">{children}</span>
    </div>
  );
  const parentName = useMemo(() => character.parentId, [character.parentId]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-1.5"><History className="size-4" /> {t('editor.history.revisions')}</span>}>
        <div className="mb-3 flex flex-col gap-1">
          <Row label={t('editor.history.id')}>{character.id}</Row>
          <Row label={t('editor.history.identityVersion')}>{character.identityVersion}</Row>
          {parentName && (
            <Row label={t('editor.history.parent')}>
              <Link className="text-accent hover:underline" to={`/characters/${character.parentId}`}>
                {character.parentId}
              </Link>
            </Row>
          )}
        </div>
        {revisions?.length === 0 && <p className="text-sm text-muted">{t('editor.history.noRevisions')}</p>}
        <ul className="flex flex-col divide-y divide-border">
          {revisions?.map((r) => (
            <li key={r.id} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('editor.history.version', { version: r.version })}</div>
                <div className="text-xs text-muted">
                  {formatDateTime(r.createdAt)}
                  {r.reason ? ` · ${r.reason}` : ''}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{r.snapshot.biography}</p>
              </div>
              <Button
                size="sm"
                icon={<RotateCcw className="size-3.5" />}
                onClick={async () => {
                  if (!window.confirm(t('editor.history.restoreConfirm', { version: r.version }))) return;
                  try {
                    await api.post(`/api/characters/${character.id}/revisions/${r.id}/restore`);
                    toast(t('editor.history.restoredToast'), 'success');
                    await invalidate('character', 'characters');
                  } catch (err) {
                    toast(errorText(err), 'error');
                  }
                }}
              >
                {t('editor.history.restore')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={<span className="inline-flex items-center gap-1.5"><GitBranch className="size-4" /> {t('editor.history.variants')}</span>}>
        <p className="mb-3 text-xs text-muted">{t('editor.history.variantsHelp')}</p>
        {variants?.length === 0 && <p className="mb-3 text-sm text-muted">{t('editor.history.noVariants')}</p>}
        <ul className="mb-4 flex flex-col gap-1">
          {variants?.map((v) => (
            <li key={v.id}>
              <Link to={`/characters/${v.id}`} className="text-sm text-accent hover:underline">
                {v.name}
              </Link>
              {v.variantNote && <span className="text-xs text-muted"> — {v.variantNote}</span>}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <TextField label={t('editor.history.variantName')} value={variant.name} onChange={(v) => setVariant({ ...variant, name: v })} />
          <TextField label={t('editor.history.variantNote')} value={variant.variantNote} onChange={(v) => setVariant({ ...variant, variantNote: v })} />
          <Field label={t('editor.history.copyMemories')}>
            <Select value={variant.copyMemories} onChange={(e) => setVariant({ ...variant, copyMemories: e.target.value as typeof variant.copyMemories })}>
              <option value="none">{t('editor.history.copyNone')}</option>
              <option value="core">{t('editor.history.copyCore')}</option>
              <option value="personal">{t('editor.history.copyPersonal')}</option>
            </Select>
          </Field>
          <div>
            <Button
              variant="primary"
              icon={<GitBranch className="size-4" />}
              disabled={!variant.name.trim()}
              onClick={async () => {
                try {
                  const created = await api.post<Character>(`/api/characters/${character.id}/variants`, variant);
                  toast(t('editor.history.variantCreated'), 'success');
                  await invalidate('characters', 'character');
                  navigate(`/characters/${created.id}`);
                } catch (err) {
                  toast(errorText(err), 'error');
                }
              }}
            >
              {t('editor.history.createVariant')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Progetto in cui creare il nuovo personaggio (predefinito: il progetto attivo). */
function NewProjectSelect({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { t } = useTranslation();
  const { projects } = useActiveProject();
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <label htmlFor="new-character-project" className="text-muted">
        {t('projects.projectField')}
      </label>
      <Select id="new-character-project" className="h-7! w-56 py-0! text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('projects.none')}</option>
        {projects
          .filter((p) => p.status === 'active' || p.id === value)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
    </div>
  );
}

/** Progetti (storie) a cui partecipa il personaggio: l'appartenenza non è una modifica d'identità. */
function ProjectMembership({ character }: { character: Character }) {
  const { t } = useTranslation();
  const { projects } = useActiveProject();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const remove = useRemoveFromProject();
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const others = projects.filter((p) => p.status === 'active' && !character.projectIds.includes(p.id));

  const add = async (projectId: string) => {
    try {
      await api.post(`/api/projects/${projectId}/characters`, { characterId: character.id });
      toast(t('projects.added'), 'success');
      await invalidate('characters', 'character', 'projects');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" aria-label={t('projects.membership')} role="group">
      <span className="text-muted">{t('projects.membership')}:</span>
      {character.projectIds.length === 0 && <span className="text-muted">{t('projects.none')}</span>}
      {character.projectIds.map((pid) => {
        const name = names.get(pid) ?? pid;
        return (
          <span key={pid} className="inline-flex items-center gap-1 rounded border border-border bg-panel-2 py-0.5 pl-1.5 pr-0.5">
            {name}
            <button
              type="button"
              className="rounded p-0.5 text-muted hover:text-danger"
              aria-label={`${t('projects.removeFromProject')}: ${name}`}
              title={t('projects.removeFromProject')}
              onClick={() => void remove(pid, character)}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        );
      })}
      {others.length > 0 && (
        <Select
          aria-label={t('projects.addToProject')}
          className="h-6! w-48 py-0! text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value) void add(e.target.value);
          }}
        >
          <option value="">{t('projects.addToProject')}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
