import type { SyncFolderSuggestion, SyncStatus } from '@persona/shared/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, FolderSync, KeyRound, Laptop, Lock, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../api/client';
import { qk, useSyncStatus } from '../../api/hooks';
import { formatDateTime, formatRelative } from '../../lib/format';
import { useRunSync } from '../../lib/sync';
import { useUi } from '../../stores/ui';
import { Badge, Button, Card, Checkbox, Field, Input, Select, Spinner, useErrorText } from '../ui';

const INTERVALS = [0, 1, 5, 15, 60];

/** Messaggio specifico per gli errori di cartella e passphrase (dettagli del server). */
function useSyncErrorText() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  return (err: unknown): string => {
    if (err instanceof ApiError && (err.code === 'sync_folder' || err.code === 'sync_passphrase')) {
      const reason = (err.details as { reason?: string } | undefined)?.reason;
      if (reason) return t(`sync.reasons.${reason}`, { defaultValue: errorText(err) });
    }
    return errorText(err);
  };
}

export function SyncCard() {
  const { t } = useTranslation();
  const { data: status, isLoading } = useSyncStatus();
  return (
    <section id="sync" className="scroll-mt-4">
      <Card
        title={
          <span className="flex items-center gap-2">
            <FolderSync className="size-4 text-accent" aria-hidden />
            {t('sync.title')}
          </span>
        }
        actions={status?.configured ? <ConnectedActions status={status} /> : null}
      >
        {isLoading || !status ? <Spinner /> : status.configured ? <Connected status={status} /> : <ConnectForm status={status} />}
      </Card>
    </section>
  );
}

function ConnectedActions({ status }: { status: SyncStatus }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const runSync = useRunSync();
  const toast = useUi((s) => s.toast);
  const errorText = useSyncErrorText();
  return (
    <>
      <Button
        size="sm"
        variant="danger"
        icon={<Unplug className="size-3.5" />}
        onClick={async () => {
          if (!window.confirm(t('sync.disconnectConfirm'))) return;
          qc.setQueryData(qk.sync, await api.put<SyncStatus>('/api/sync', { folder: null }));
        }}
      >
        {t('sync.disconnect')}
      </Button>
      <Button
        size="sm"
        variant="primary"
        icon={<RefreshCw className="size-3.5" />}
        loading={status.running}
        onClick={async () => {
          try {
            const s = await runSync();
            toast(t('sync.done', { sent: s.lastResult?.sent ?? 0, received: s.lastResult?.received ?? 0 }), 'success');
          } catch (err) {
            toast(errorText(err), 'error');
          }
        }}
      >
        {t('sync.syncNow')}
      </Button>
    </>
  );
}

function ConnectForm({ status }: { status: SyncStatus }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const runSync = useRunSync();
  const toast = useUi((s) => s.toast);
  const errorText = useSyncErrorText();
  const { data: suggestions } = useQuery({ queryKey: ['sync', 'folders'], queryFn: () => api.get<SyncFolderSuggestion[]>('/api/sync/folders') });
  const [folder, setFolder] = useState(status.folder ?? '');
  const [deviceName, setDeviceName] = useState(status.deviceName);
  const [passphrase, setPassphrase] = useState('');
  const [interval, setIntervalMinutes] = useState(status.intervalMinutes || 5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.put<SyncStatus>('/api/sync', {
        folder: folder.trim(),
        deviceName: deviceName.trim() || undefined,
        intervalMinutes: interval,
        passphrase: passphrase || undefined,
      });
      qc.setQueryData(qk.sync, next);
      setPassphrase('');
      const s = await runSync();
      toast(t('sync.connected', { sent: s.lastResult?.sent ?? 0, received: s.lastResult?.received ?? 0 }), 'success');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted">
        <p>{t('sync.intro')}</p>
        <ul className="mt-2 list-disc pl-4">
          <li>{t('sync.howFolder')}</li>
          <li>{t('sync.howDevices')}</li>
          <li>{t('sync.howLocal')}</li>
        </ul>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">{t('sync.detected')}</div>
        {suggestions === undefined ? null : suggestions.length === 0 ? (
          <p className="text-xs text-muted">{t('sync.detectedNone')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <Button key={s.root} size="sm" icon={<Cloud className="size-3.5" />} title={s.path} onClick={() => setFolder(s.path)}>
                {s.label}
                <span className="max-w-64 truncate font-mono text-[11px] text-muted">{s.root}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('sync.folder')} help={t('sync.folderHelp')} className="md:col-span-2">
          <Input className="font-mono text-xs" value={folder} placeholder={t('sync.folderPlaceholder')} onChange={(e) => setFolder(e.target.value)} />
        </Field>
        <Field label={t('sync.deviceName')} help={t('sync.deviceNameHelp')}>
          <Input value={deviceName} maxLength={80} onChange={(e) => setDeviceName(e.target.value)} />
        </Field>
        <Field label={t('sync.interval')}>
          <Select value={interval} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t('sync.intervalManual') : t('sync.intervalMinutes', { count: m })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('sync.passphrase')} help={t('sync.passphraseHelp')} className="md:col-span-2">
          <Input type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button variant="primary" icon={<FolderSync className="size-4" />} loading={busy} disabled={!folder.trim() || (passphrase.length > 0 && passphrase.length < 8)} onClick={connect}>
          {t('sync.connect')}
        </Button>
        {passphrase.length > 0 && passphrase.length < 8 && <span className="ml-2 text-xs text-muted">{t('sync.passphraseShort')}</span>}
      </div>
    </div>
  );
}

function Connected({ status }: { status: SyncStatus }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const errorText = useSyncErrorText();
  const [deviceName, setDeviceName] = useState(status.deviceName);
  const [passphrase, setPassphrase] = useState('');
  useEffect(() => setDeviceName(status.deviceName), [status.deviceName]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      qc.setQueryData(qk.sync, await api.put<SyncStatus>('/api/sync', patch));
      return true;
    } catch (err) {
      toast(errorText(err), 'error');
      return false;
    }
  };
  const r = status.lastResult;
  const needsPassphrase = status.lastError?.code === 'sync_passphrase';

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">{t('sync.folder')}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs break-all">{status.folder}</span>
          {status.encrypted ? (
            <Badge tone="ok">
              <Lock className="size-3" aria-hidden />
              {t('sync.encrypted')}
            </Badge>
          ) : (
            <Badge>{t('sync.notEncrypted')}</Badge>
          )}
        </dd>
        <dt className="text-muted">{t('sync.lastSync')}</dt>
        <dd>
          {status.running ? (
            t('sync.running')
          ) : status.lastSyncAt ? (
            <span title={formatDateTime(status.lastSyncAt)}>{formatRelative(status.lastSyncAt)}</span>
          ) : (
            t('sync.never')
          )}
          {r && !status.lastError && (
            <span className="ml-2 text-xs text-muted">
              {r.sent === 0 && r.received === 0 ? t('sync.resultNothing') : t('sync.result', { sent: r.sent, received: r.received })}
            </span>
          )}
        </dd>
        {(status.unsent > 0 || status.pending > 0) && (
          <>
            <dt className="text-muted">{t('sync.queue')}</dt>
            <dd className="text-xs text-muted">
              {status.unsent > 0 && t('sync.unsent', { count: status.unsent })}
              {status.unsent > 0 && status.pending > 0 && ' · '}
              {status.pending > 0 && t('sync.pending', { count: status.pending })}
            </dd>
          </>
        )}
      </dl>

      {status.lastError && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 p-2.5 text-sm text-danger">
          {t('sync.failed', { error: errorText(status.lastError) })}
        </p>
      )}
      {r?.adopted && <p className="text-xs text-muted">{t('sync.adopted')}</p>}
      {r?.forked && <p className="text-xs text-muted">{t('sync.forked')}</p>}

      {needsPassphrase && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('sync.passphrase')} className="min-w-64 flex-1">
            <Input type="password" autoComplete="current-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </Field>
          <Button
            icon={<KeyRound className="size-4" />}
            disabled={passphrase.length < 8}
            onClick={async () => {
              if (await save({ passphrase })) setPassphrase('');
            }}
          >
            {t('sync.unlock')}
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t('sync.deviceName')}>
          <Input
            value={deviceName}
            maxLength={80}
            onChange={(e) => setDeviceName(e.target.value)}
            onBlur={() => {
              const v = deviceName.trim();
              if (v && v !== status.deviceName) void save({ deviceName: v });
            }}
          />
        </Field>
        <Field label={t('sync.interval')}>
          <Select value={status.intervalMinutes} onChange={(e) => void save({ intervalMinutes: Number(e.target.value) })}>
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t('sync.intervalManual') : t('sync.intervalMinutes', { count: m })}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end pb-1.5">
          <Checkbox label={t('sync.auto')} checked={status.enabled} onChange={(v) => void save({ enabled: v })} />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">{t('sync.devices')}</div>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {status.devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <Laptop className="size-4 text-muted" aria-hidden />
              <span className="font-medium">{d.name}</span>
              {d.self && <Badge tone="accent">{t('sync.thisDevice')}</Badge>}
              {d.blocked && <Badge tone="warn">{t(`sync.blocked.${d.blocked}`)}</Badge>}
              <span className="ml-auto text-xs text-muted">
                {d.lastSeenAt ? t('sync.lastSeen', { when: formatRelative(d.lastSeenAt) }) : t('sync.neverSeen')}
                {d.appVersion && ` · v${d.appVersion}`}
              </span>
            </li>
          ))}
        </ul>
        {status.devices.length === 1 && <p className="mt-1.5 text-xs text-muted">{t('sync.onlyThisDevice')}</p>}
      </div>
    </div>
  );
}
