import { Cloud, CloudAlert, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSyncStatus } from '../../api/hooks';
import { formatRelative } from '../../lib/format';
import { useEditing, useRunSync } from '../../lib/sync';
import { useUi } from '../../stores/ui';
import { cx, useErrorText } from '../ui';

/**
 * Stato della sincronizzazione in fondo al pannello laterale (solo se configurata):
 * un clic sincronizza subito, utile prima di passare a un altro dispositivo.
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const { data: status } = useSyncStatus();
  const runSync = useRunSync();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const waiting = useEditing((s) => s.refreshPending);
  if (!status?.configured) return null;

  const failed = !!status.lastError;
  const label = status.running
    ? t('sync.running')
    : failed
      ? t('sync.indicatorError')
      : waiting
        ? t('sync.waitingRefresh')
        : status.lastSyncAt
          ? t('sync.indicatorOk', { when: formatRelative(status.lastSyncAt) })
          : t('sync.never');
  const Icon = status.running ? RefreshCw : failed ? CloudAlert : Cloud;
  return (
    <div className="border-t border-border p-2">
      <button
        type="button"
        title={`${label} — ${t('sync.syncNow')}`}
        aria-label={`${label} — ${t('sync.syncNow')}`}
        disabled={status.running}
        onClick={async () => {
          try {
            await runSync();
          } catch (err) {
            toast(errorText(err), 'error');
          }
        }}
        className={cx(
          'flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-xs md:justify-start',
          failed ? 'text-danger hover:bg-danger/5' : 'text-muted hover:bg-panel-2 hover:text-text',
        )}
      >
        <Icon className={cx('size-4 shrink-0', status.running && 'animate-spin', waiting && !failed && 'text-accent')} aria-hidden />
        <span className="hidden truncate md:inline">{label}</span>
      </button>
    </div>
  );
}
