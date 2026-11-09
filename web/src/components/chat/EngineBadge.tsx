import type { EngineStatus } from '@persona/shared/client';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { cx, useErrorText } from '../ui';

/** Indicatore della disponibilità del motore LLM del personaggio (verificato ogni 30 s). */
export function EngineBadge({ characterId }: { characterId: string }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { data, isLoading } = useQuery({
    queryKey: ['engine-status', characterId],
    queryFn: () => api.get<EngineStatus>(`/api/characters/${characterId}/engine-status`),
    refetchInterval: 30_000,
    retry: false,
  });
  const state = isLoading || !data ? 'checking' : !data.available ? 'down' : data.loaded === false ? 'cold' : 'ok';
  const label =
    state === 'checking'
      ? t('chat.engineChecking')
      : state === 'down'
        ? t('chat.engineDown')
        : t('chat.engineOk', { model: data?.model ?? '' });
  const title = [
    data?.configName,
    state === 'down' && data?.error ? errorText(data.error) : null,
    state === 'cold' ? t('chat.engineNotLoaded') : null,
    t('chat.engineSettings'),
  ]
    .filter(Boolean)
    .join(' — ');
  return (
    <Link
      to={state === 'down' ? '/settings' : `/characters/${characterId}?tab=model`}
      title={title}
      aria-label={`${label}. ${title}`}
      className={cx(
        'inline-flex max-w-56 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px]',
        state === 'down' ? 'border-danger/50 text-danger' : 'border-border text-muted hover:text-text',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-2 shrink-0 rounded-full',
          state === 'ok' && 'bg-ok',
          state === 'cold' && 'bg-warn',
          state === 'down' && 'bg-danger',
          state === 'checking' && 'bg-muted',
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
