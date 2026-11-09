import { AUTO_LANGUAGE, COMMON_LANGUAGE_CODES } from '@persona/shared/client';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languageLabel, nativeLanguageLabel } from '../lib/format';
import { cx, IconButton, Input, Select } from './ui';

const CUSTOM = '__custom__';
const BCP47 = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Selettore di lingua con nomi localizzati (Intl.DisplayNames).
 * L'elenco non è limitante: "Altro codice…" consente qualsiasi codice BCP-47
 * (campo in linea: window.prompt non è disponibile nell'app desktop).
 */
export function LanguageSelect({
  value,
  onChange,
  allowAuto,
  allowNone,
  noneLabel,
  autoLabel,
  id,
  className,
  ariaLabel,
}: {
  value: string | null | undefined;
  onChange(v: string | null): void;
  allowAuto?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  autoLabel?: string;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState<string | null>(null);
  const codes: string[] = [...COMMON_LANGUAGE_CODES];
  if (value && value !== AUTO_LANGUAGE && !codes.includes(value)) codes.push(value);

  if (custom !== null) {
    const valid = BCP47.test(custom.trim());
    const confirm = () => {
      if (!valid) return;
      onChange(custom.trim());
      setCustom(null);
    };
    return (
      <div className={cx('flex items-center gap-1', className)}>
        <Input
          id={id}
          autoFocus
          className={cx(!valid && custom && 'border-danger')}
          value={custom}
          placeholder="pt-BR"
          aria-label={t('common.customLanguagePrompt')}
          title={t('common.customLanguagePrompt')}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            }
            if (e.key === 'Escape') setCustom(null);
          }}
        />
        <IconButton label={t('common.confirm')} icon={<Check className="size-4" />} disabled={!valid} onClick={confirm} />
        <IconButton label={t('common.cancel')} icon={<X className="size-4" />} onClick={() => setCustom(null)} />
      </div>
    );
  }

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      className={className}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === CUSTOM) {
          setCustom('');
          return;
        }
        onChange(v === '' ? null : v);
      }}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.none')}</option>}
      {allowAuto && <option value={AUTO_LANGUAGE}>{autoLabel ?? t('chat.languageAuto')}</option>}
      {codes.map((c) => {
        const local = languageLabel(c);
        const native = nativeLanguageLabel(c);
        return (
          <option key={c} value={c}>
            {local}
            {native !== local ? ` · ${native}` : ''} ({c})
          </option>
        );
      })}
      <option value={CUSTOM}>{t('common.customLanguage')}</option>
    </Select>
  );
}
