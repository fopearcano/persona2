import type {
  AppInfo,
  BackupInfo,
  BookStatus,
  BuildContext,
  CastMember,
  CoachThread,
  CoachThreadDetail,
  Character,
  CharacterSummary,
  Conversation,
  ConversationDetail,
  IdentityRevision,
  KnowledgeSource,
  Memory,
  ModelConfig,
  Preferences,
  ProjectSummary,
  ScenarioDetail,
  ScenarioSummary,
  SyncStatus,
} from '@persona/shared/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const qk = {
  projects: ['projects'] as const,
  characters: (status?: string, projectId?: string | null) => ['characters', status ?? 'all', projectId ?? 'all'] as const,
  character: (id: string) => ['character', id] as const,
  revisions: (id: string) => ['character', id, 'revisions'] as const,
  variants: (id: string) => ['character', id, 'variants'] as const,
  knowledge: (id: string) => ['character', id, 'knowledge'] as const,
  conversations: (params: Record<string, string | undefined>) => ['conversations', params] as const,
  conversation: (id: string, superseded = false) => ['conversation', id, superseded] as const,
  memories: (params: Record<string, string | undefined>) => ['memories', params] as const,
  scenarios: (projectId?: string | null) => ['scenarios', projectId ?? 'all'] as const,
  scenario: (id: string) => ['scenario', id] as const,
  modelConfigs: ['model-configs'] as const,
  preferences: ['preferences'] as const,
  backups: ['backups'] as const,
  info: ['info'] as const,
  buildContext: (id: string, projectId?: string | null) => ['character', id, 'build-context', projectId ?? 'auto'] as const,
  projectCast: (id: string) => ['projects', id, 'cast'] as const,
  book: ['book'] as const,
  coachThreads: (characterId: string) => ['character', characterId, 'coach'] as const,
  coachThread: (id: string) => ['coach', id] as const,
  sync: ['sync'] as const,
};

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** `projectId`: progetto attivo (null/undefined = tutti i progetti). */
export const useCharacters = (status?: string, projectId?: string | null) =>
  useQuery({
    queryKey: qk.characters(status, projectId),
    queryFn: () => api.get<CharacterSummary[]>(`/api/characters${qs({ status, projectId: projectId ?? undefined })}`),
  });

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.get<ProjectSummary[]>('/api/projects') });

export const useCharacter = (id: string | undefined) =>
  useQuery({ queryKey: qk.character(id ?? ''), queryFn: () => api.get<Character>(`/api/characters/${id}`), enabled: !!id });

export const useRevisions = (id: string | undefined) =>
  useQuery({ queryKey: qk.revisions(id ?? ''), queryFn: () => api.get<IdentityRevision[]>(`/api/characters/${id}/revisions`), enabled: !!id });

export const useVariants = (id: string | undefined) =>
  useQuery({
    queryKey: qk.variants(id ?? ''),
    queryFn: () => api.get<{ id: string; name: string; variantNote: string | null; updatedAt: string }[]>(`/api/characters/${id}/variants`),
    enabled: !!id,
  });

export const useKnowledge = (id: string | undefined) =>
  useQuery({ queryKey: qk.knowledge(id ?? ''), queryFn: () => api.get<KnowledgeSource[]>(`/api/characters/${id}/knowledge`), enabled: !!id });

export const useConversations = (
  params: { characterId?: string; scenarioId?: string; kind?: string; archived?: string; projectId?: string },
  enabled = true,
) =>
  useQuery({ queryKey: qk.conversations(params), queryFn: () => api.get<Conversation[]>(`/api/conversations${qs(params)}`), enabled });

export const useConversation = (id: string | undefined, superseded = false) =>
  useQuery({
    queryKey: qk.conversation(id ?? '', superseded),
    queryFn: () => api.get<ConversationDetail>(`/api/conversations/${id}${superseded ? '?superseded=1' : ''}`),
    enabled: !!id,
  });

export const useMemories = (params: { characterId?: string; category?: string; scenarioId?: string; status?: string; q?: string }, enabled = true) =>
  useQuery({ queryKey: qk.memories(params), queryFn: () => api.get<Memory[]>(`/api/memories${qs(params)}`), enabled });

export const useScenarios = (projectId?: string | null) =>
  useQuery({
    queryKey: qk.scenarios(projectId),
    queryFn: () => api.get<ScenarioSummary[]>(`/api/scenarios${qs({ projectId: projectId ?? undefined })}`),
  });

export const useScenario = (id: string | undefined) =>
  useQuery({ queryKey: qk.scenario(id ?? ''), queryFn: () => api.get<ScenarioDetail>(`/api/scenarios/${id}`), enabled: !!id });

export const useModelConfigs = () => useQuery({ queryKey: qk.modelConfigs, queryFn: () => api.get<ModelConfig[]>('/api/model-configs') });

export const usePreferences = () => useQuery({ queryKey: qk.preferences, queryFn: () => api.get<Preferences>('/api/preferences') });

export const useBackups = () => useQuery({ queryKey: qk.backups, queryFn: () => api.get<BackupInfo[]>('/api/backups') });

export const useInfo = () => useQuery({ queryKey: qk.info, queryFn: () => api.get<AppInfo>('/api/info') });

/* ---------------- Costruzione McKee (PERSONA 2) ---------------- */

export const useBuildContext = (id: string | undefined, projectId?: string | null) =>
  useQuery({
    queryKey: qk.buildContext(id ?? '', projectId),
    queryFn: () => api.get<BuildContext>(`/api/characters/${id}/build-context${qs({ projectId: projectId ?? undefined })}`),
    enabled: !!id,
  });

export const useProjectCast = (projectId: string | null | undefined) =>
  useQuery({ queryKey: qk.projectCast(projectId ?? ''), queryFn: () => api.get<CastMember[]>(`/api/projects/${projectId}/cast`), enabled: !!projectId });

/** Stato della sincronizzazione: aggiornato spesso solo mentre è attiva. */
export const useSyncStatus = () =>
  useQuery({
    queryKey: qk.sync,
    queryFn: () => api.get<SyncStatus>('/api/sync'),
    refetchInterval: (q) => (!q.state.data?.enabled ? false : q.state.data.running ? 2000 : 15_000),
  });

export const useBook = () => useQuery({ queryKey: qk.book, queryFn: () => api.get<BookStatus>('/api/book') });

/** `mode`: fili del coach o dell'assistente di costruzione. */
export const useCoachThreads = (characterId: string | undefined, mode: 'coach' | 'guide' = 'coach') =>
  useQuery({
    queryKey: [...qk.coachThreads(characterId ?? ''), mode],
    queryFn: () => api.get<CoachThread[]>(`/api/characters/${characterId}/coach?mode=${mode}`),
    enabled: !!characterId,
  });

export const useCoachThread = (id: string | null | undefined) =>
  useQuery({ queryKey: qk.coachThread(id ?? ''), queryFn: () => api.get<CoachThreadDetail>(`/api/coach/threads/${id}`), enabled: !!id });

/** Invalida i dati collegati dopo una modifica. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: string[]) => Promise.all(prefixes.map((p) => qc.invalidateQueries({ queryKey: [p] })));
}
