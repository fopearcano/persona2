import type { SyncFolderSuggestion, SyncStatus } from '@persona/shared/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { qk } from '../../api/hooks';
import i18n from '../../i18n';
import { useEditing, useSyncRefresh } from '../../lib/sync';
import { SyncCard } from './SyncCard';
import { SyncIndicator } from './SyncIndicator';

const base: SyncStatus = {
  configured: false,
  enabled: false,
  folder: null,
  deviceId: 'a'.repeat(32),
  deviceName: 'Portatile',
  intervalMinutes: 5,
  encrypted: false,
  running: false,
  lastSyncAt: null,
  lastError: null,
  lastResult: null,
  lastImportAt: null,
  unsent: 0,
  pending: 0,
  devices: [],
};
const suggestions: SyncFolderSuggestion[] = [{ provider: 'google-drive', label: 'Google Drive', root: 'G:\\Il mio Drive', path: 'G:\\Il mio Drive\\PERSONA' }];

let status: SyncStatus = base;
beforeAll(async () => {
  await i18n.changeLanguage('it');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url === '/api/sync/folders' ? suggestions : url === '/api/sync' ? status : [];
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  cleanup();
  status = base;
  useEditing.setState({ dirty: [], refreshPending: false });
});

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('sync settings', () => {
  it('offers the cloud folders found on the computer', async () => {
    const qc = newClient();
    render(<SyncCard />, { wrapper: wrapper(qc) });
    const drive = await screen.findByRole('button', { name: /Google Drive/ });
    fireEvent.click(drive);
    expect((screen.getByLabelText('Cartella di sincronizzazione') as HTMLInputElement).value).toBe('G:\\Il mio Drive\\PERSONA');
    expect(screen.getByRole('button', { name: 'Collega e sincronizza' })).toBeTruthy();
  });

  it('shows devices and state once connected, and the side indicator', async () => {
    status = {
      ...base,
      configured: true,
      enabled: true,
      folder: 'G:\\Il mio Drive\\PERSONA',
      encrypted: true,
      lastSyncAt: new Date().toISOString(),
      lastResult: { at: new Date().toISOString(), durationMs: 5, sent: 3, received: 7, pending: 0, skipped: 0, adopted: false, forked: false, compacted: false },
      devices: [
        { id: 'a'.repeat(32), name: 'Portatile', self: true, appVersion: '2.0.0', lastSeq: 3, appliedSeq: 3, lastSeenAt: null, blocked: null },
        { id: 'b'.repeat(32), name: 'Fisso', self: false, appVersion: '2.1.0', lastSeq: 9, appliedSeq: 8, lastSeenAt: null, blocked: 'newer_version' },
      ],
    };
    const qc = newClient();
    render(
      <>
        <SyncCard />
        <SyncIndicator />
      </>,
      { wrapper: wrapper(qc) },
    );
    expect(await screen.findByText('Fisso')).toBeTruthy();
    expect(screen.getByText('Cifrata')).toBeTruthy();
    expect(screen.getByText('versione più recente: aggiorna PERSONA')).toBeTruthy();
    expect(screen.getByText('3 inviati, 7 ricevuti')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sincronizzato .* Sincronizza ora/ })).toBeTruthy();
  });

  it('hides the indicator when sync is not set up', async () => {
    const qc = newClient();
    const { container } = render(<SyncIndicator />, { wrapper: wrapper(qc) });
    await waitFor(() => expect(qc.getQueryData(qk.sync)).toBeTruthy());
    expect(container.textContent).toBe('');
  });
});

describe('refresh after changes from other devices', () => {
  it('reloads the data, but only once no editor has unsaved changes', async () => {
    status = { ...base, configured: true, enabled: true, lastImportAt: '2026-11-11T10:00:00.000Z' };
    const qc = newClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSyncRefresh(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(qc.getQueryData(qk.sync)).toBeTruthy());
    expect(spy).not.toHaveBeenCalled();

    // Una bozza aperta: le modifiche arrivate restano in attesa.
    act(() => useEditing.getState().mark('editor', true));
    act(() => qc.setQueryData(qk.sync, { ...status, lastImportAt: '2026-11-11T10:05:00.000Z' }));
    await waitFor(() => expect(useEditing.getState().refreshPending).toBe(true));
    expect(spy).not.toHaveBeenCalled();

    act(() => useEditing.getState().mark('editor', false));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(useEditing.getState().refreshPending).toBe(false);
  });
});
