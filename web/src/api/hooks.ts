import type {
  AppInfo,
  BackupInfo,
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

/** Invalida i dati collegati dopo una modifica. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: string[]) => Promise.all(prefixes.map((p) => qc.invalidateQueries({ queryKey: [p] })));
}
