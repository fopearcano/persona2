import type { ProjectSummary } from '@persona/shared/client';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../api/client';
import { useInvalidate, useProjects } from '../api/hooks';
import { useErrorText } from '../components/ui';
import { useUi } from '../stores/ui';

/**
 * Progetto attivo, verificato contro l'elenco dei progetti (un id non più esistente vale
 * "tutti i progetti"). `projectId` è da passare ai filtri delle API.
 */
export function useActiveProject(): {
  projectId: string | null;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  loading: boolean;
  setActive(id: string | null): void;
} {
  const { data, isLoading } = useProjects();
  const activeId = useUi((s) => s.activeProjectId);
  const setActive = useUi((s) => s.setActiveProject);
  const projects = data ?? [];
  const project = projects.find((p) => p.id === activeId) ?? null;
  return { projectId: data ? (project?.id ?? null) : activeId, project, projects, loading: isLoading, setActive };
}

/**
 * Rimuove un personaggio da un progetto (non lo elimina). Se partecipa ancora a scenari del
 * progetto il server risponde 409: il messaggio elenca gli scenari, localizzato qui.
 */
export function useRemoveFromProject() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  return async (projectId: string, character: { id: string; name: string }): Promise<boolean> => {
    if (!window.confirm(t('projects.removeFromProjectConfirm', { name: character.name }))) return false;
    try {
      await api.del(`/api/projects/${projectId}/characters/${character.id}`);
      await invalidate('characters', 'character', 'projects');
      return true;
    } catch (err) {
      const scenarios = err instanceof ApiError && err.status === 409 ? (err.details as { scenarios?: string[] } | undefined)?.scenarios : undefined;
      toast(scenarios ? t('projects.removeBlocked', { name: character.name, scenarios: scenarios.join(', ') }) : errorText(err), 'error');
      return false;
    }
  };
}
