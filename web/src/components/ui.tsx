import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  createContext,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
} from 'react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { useUi } from '../stores/ui';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Pulsanti e campi                                                    */
/* ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 border border-transparent',
  secondary: 'bg-panel-2 text-text border border-border hover:border-muted',
  ghost: 'text-muted hover:text-text hover:bg-panel-2 border border-transparent',
  danger: 'text-danger border border-border hover:border-danger bg-transparent',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode; loading?: boolean }
>(function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  icon,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx('inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-text disabled:opacity-40', className)}
      {...rest}
    >
      {icon}
    </button>
  );
}

/** Id del controllo associato all'etichetta del Field (accessibilità). */
const FieldIdContext = createContext<string | undefined>(undefined);

const fieldBaseCore =
  'min-w-0 rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:opacity-60';
/** Larghezza piena salvo che il chiamante specifichi una larghezza esplicita (w-*). */
const fieldBase = (className?: string) => cx(fieldBaseCore, !/(^|\s)w-/.test(className ?? '') && 'w-full');

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, id, ...rest }, ref) {
  const fieldId = useContext(FieldIdContext);
  return <input ref={ref} id={id ?? fieldId} className={cx(fieldBase(className), 'h-8', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }>(
  function Textarea({ className, autoGrow, onInput, id, ...rest }, ref) {
    const fieldId = useContext(FieldIdContext);
    return (
      <textarea
        ref={ref}
        id={id ?? fieldId}
        className={cx(fieldBase(className), 'min-h-[4.5rem] resize-y leading-relaxed', className)}
        onInput={(e) => {
          if (autoGrow) {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
          }
          onInput?.(e);
        }}
        {...rest}
      />
    );
  },
);

export function Select({ className, children, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = useContext(FieldIdContext);
  return (
    <select id={id ?? fieldId} className={cx(fieldBase(className), 'h-8 pr-7', className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * Campo con etichetta. Il primo controllo (Input/Select/Textarea) senza id esplicito
 * viene associato automaticamente all'etichetta. `group` disattiva l'associazione
 * per i campi che contengono più controlli.
 */
export function Field({
  label,
  help,
  children,
  className,
  htmlFor,
  group,
}: {
  label: ReactNode;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  group?: boolean;
}) {
  const autoId = useId();
  const id = group ? undefined : (htmlFor ?? autoId);
  return (
    <div className={cx('flex flex-col gap-1', className)} role={group ? 'group' : undefined}>
      {group ? (
        <span className="text-xs font-medium text-muted">{label}</span>
      ) : (
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
      {help && <p className="text-xs text-muted/80">{help}</p>}
    </div>
  );
}

/** Campo di testo con etichetta collegata (accessibilità). */
export function TextField({
  label,
  help,
  value,
  onChange,
  multiline,
  rows,
  className,
  placeholder,
  type,
}: {
  label: ReactNode;
  help?: ReactNode;
  value: string | null | undefined;
  onChange(v: string): void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} className={className} htmlFor={id}>
      {multiline ? (
        <Textarea id={id} rows={rows ?? 3} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm select-none', disabled && 'opacity-60')}>
      <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Contenitori e stati                                                 */
/* ------------------------------------------------------------------ */

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx('rounded-lg border border-border bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const BADGE_TONES = {
  neutral: 'border-border text-muted',
  accent: 'border-accent/40 text-accent bg-accent-soft',
  warn: 'border-warn/40 text-warn',
  danger: 'border-danger/40 text-danger',
  ok: 'border-ok/40 text-ok',
  analysis: 'border-analysis/40 text-analysis',
  narration: 'border-narration/40 text-narration',
} as const;

export function Badge({ children, tone = 'neutral', title, className }: { children: ReactNode; tone?: keyof typeof BADGE_TONES; title?: string; className?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-px text-[11px] leading-4 whitespace-nowrap', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ?? t('common.loading')}
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
      <div>{children}</div>
      {action}
    </div>
  );
}

/** Messaggio d'errore localizzato a partire da un ApiError o da un codice. */
export function useErrorText() {
  const { t } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError && err.code === 'invalid_import') {
      const text = importFileText(t, err.details);
      if (text) return text;
    }
    if (err instanceof ApiError) {
      const key = `errors.${err.code}`;
      return t(key, { message: err.message, defaultValue: err.message || t('errors.generic') });
    }
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; message?: string };
      return t(`errors.${e.code}`, { message: e.message ?? '', defaultValue: e.message ?? t('errors.generic') });
    }
    return t('errors.generic');
  };
}

/** File di PERSONA del tipo sbagliato o di una versione più recente (dettagli del server). */
const FOUND_KEY: Record<string, string> = {
  'persona.character': 'importFile.isCharacter',
  'persona.scenario': 'importFile.isScenario',
  'persona.project': 'importFile.isProject',
};
function importFileText(t: TFunction, details: unknown): string | null {
  const d = (details ?? {}) as { reason?: string; found?: string; version?: number; supported?: number };
  if (d.reason === 'wrong_format' && d.found && FOUND_KEY[d.found]) return t(FOUND_KEY[d.found]);
  if (d.reason === 'not_persona') return t('importFile.notPersona');
  if (d.reason === 'newer_version') return t('importFile.newerVersion', { version: d.version, supported: d.supported });
  return null;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?(): void }) {
  const { t } = useTranslation();
  const text = useErrorText()(error);
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{text}</div>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose(): void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cx('flex max-h-[90vh] w-full flex-col rounded-lg border border-border bg-panel shadow-xl outline-none', wide ? 'max-w-4xl' : 'max-w-lg')}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton label={t('common.close')} icon={<X className="size-4" />} onClick={onClose} />
        </header>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: NoInfer<T>; label: ReactNode; badge?: ReactNode }[];
  value: T;
  onChange(v: NoInfer<T>): void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={cx(
            '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap',
            tab.id === value ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
          )}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: NoInfer<T>; label: ReactNode; title?: string }[];
  value: T;
  onChange(v: NoInfer<T>): void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cx('rounded px-2 py-0.5 text-xs', o.id === value ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex items-start gap-2 rounded-md border bg-panel px-3 py-2 text-sm shadow-lg',
            t.kind === 'error' ? 'border-danger/50 text-danger' : t.kind === 'success' ? 'border-ok/50' : 'border-border',
          )}
        >
          <span className="flex-1">{t.text}</span>
          <button type="button" className="text-muted hover:text-text" onClick={() => dismiss(t.id)} aria-label="×">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useConfirm() {
  return (text: string) => window.confirm(text);
}
