import type { SyncStatus } from '@persona/shared/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { api } from '../api/client';
import { qk, useSyncStatus } from '../api/hooks';
import { useUi } from '../stores/ui';

/**
 * Editor con modifiche non salvate. Finché ce n'è almeno uno, i dati arrivati da altri dispositivi
 * non vengono ricaricati nell'interfaccia (ricaricarli sostituirebbe la bozza): si mostrano dopo.
 */
interface EditingState {
  dirty: string[];
  /** Modifiche ricevute da mostrare appena non ci sono più bozze aperte. */
  refreshPending: boolean;
  mark(id: string, dirty: boolean): void;
  setRefreshPending(v: boolean): void;
}

export const useEditing = create<EditingState>((set, get) => ({
  dirty: [],
  refreshPending: false,
  mark(id, dirty) {
    const has = get().dirty.includes(id);
    if (dirty && !has) set({ dirty: [...get().dirty, id] });
    else if (!dirty && has) set({ dirty: get().dirty.filter((x) => x !== id) });
  },
  setRefreshPending(refreshPending) {
    set({ refreshPending });
  },
}));

/** Da chiamare negli editor: segnala le modifiche non salvate. */
export function useUnsavedChanges(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    useEditing.getState().mark(id, dirty);
    return () => useEditing.getState().mark(id, false);
  }, [id, dirty]);
}

/**
 * Ricarica i dati dell'interfaccia quando la sincronizzazione porta modifiche da altri dispositivi
 * (una volta montato nel Layout). Rimanda il ricaricamento se ci sono bozze non salvate.
 */
export function useSyncRefresh(): void {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useSyncStatus();
  const editing = useEditing((s) => s.dirty.length > 0);
  const pending = useEditing((s) => s.refreshPending);
  const seen = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!data) return;
    if (seen.current === undefined) {
      seen.current = data.lastImportAt;
      return;
    }
    if (data.lastImportAt !== seen.current) {
      seen.current = data.lastImportAt;
      useEditing.getState().setRefreshPending(true);
    }
  }, [data]);

  useEffect(() => {
    if (!pending || editing) return;
    useEditing.getState().setRefreshPending(false);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'sync' });
    toast(t('sync.updated'), 'info');
  }, [pending, editing, qc, toast, t]);
}

/** Avvia subito un giro di sincronizzazione e aggiorna lo stato. */
export function useRunSync() {
  const qc = useQueryClient();
  return async (): Promise<SyncStatus> => {
    qc.setQueryData<SyncStatus>(qk.sync, (s) => (s ? { ...s, running: true } : s));
    try {
      const status = await api.post<SyncStatus>('/api/sync/run');
      qc.setQueryData(qk.sync, status);
      return status;
    } finally {
      void qc.invalidateQueries({ queryKey: qk.sync });
    }
  };
}
