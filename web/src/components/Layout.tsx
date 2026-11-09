import { BookUser, Brain, Drama, FolderKanban, MessagesSquare, Orbit, Settings, UserPlus, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { useActiveProject } from '../lib/project';
import { cx, Select, Toasts } from './ui';

const NAV = [
  { to: '/projects', key: 'projects', icon: FolderKanban, end: false },
  { to: '/characters', key: 'characters', icon: Users, end: false },
  { to: '/characters/new', key: 'creator', icon: UserPlus, end: true },
  { to: '/dialogue', key: 'dialogue', icon: MessagesSquare },
  { to: '/scenarios', key: 'scenarios', icon: Orbit },
  { to: '/simulations', key: 'simulations', icon: Drama },
  { to: '/memory', key: 'memory', icon: Brain },
  { to: '/settings', key: 'settings', icon: Settings },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-panel focus:p-2">
        {t('common.skipToContent')}
      </a>
      <nav aria-label="PERSONA" className="flex w-14 shrink-0 flex-col border-r border-border bg-panel md:w-52">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <BookUser className="size-5 shrink-0 text-accent" aria-hidden />
          <div className="hidden leading-tight md:block">
            <div className="text-sm font-semibold tracking-[0.18em]">{t('app.name')}</div>
            <div className="text-[11px] text-muted">{t('app.tagline')}</div>
          </div>
        </div>
        <ProjectSwitcher />
        <ul className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ to, key, icon: Icon, ...rest }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={'end' in rest ? rest.end : false}
                title={t(`nav.${key}`)}
                className={({ isActive }) => {
                  // "Personaggi" resta attivo nell'editor, ma non nella creazione di un nuovo personaggio.
                  const active = key === 'characters' ? isActive && pathname !== '/characters/new' : isActive;
                  return cx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
                    active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2 hover:text-text',
                  );
                }}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="hidden md:inline">{t(`nav.${key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="min-w-0 flex-1 overflow-auto">
        {children}
      </main>
      <Toasts />
    </div>
  );
}

/** Selettore del progetto attivo: filtra personaggi, scenari, simulazioni e memoria. */
function ProjectSwitcher() {
  const { t } = useTranslation();
  const { projectId, projects, setActive } = useActiveProject();
  const visible = projects.filter((p) => p.status === 'active' || p.id === projectId);
  return (
    <div className="border-b border-border p-2">
      <div className="hidden md:block">
        <div className="mb-1 flex items-center justify-between px-0.5 text-[11px] text-muted">
          <span>{t('projects.switcher')}</span>
          <Link to="/projects" className="hover:text-text hover:underline">
            {t('projects.manage')}
          </Link>
        </div>
        <Select
          aria-label={t('projects.switcher')}
          className="h-7! py-0! text-xs"
          value={projectId ?? ''}
          onChange={(e) => setActive(e.target.value || null)}
        >
          <option value="">{t('projects.all')}</option>
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <Link to="/projects" title={t('projects.switcher')} className="flex justify-center text-muted hover:text-text md:hidden">
        <FolderKanban className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
