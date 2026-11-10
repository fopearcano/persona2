import { BookUser, Brain, Drama, FolderKanban, MessagesSquare, Network, Orbit, PanelLeftClose, PanelLeftOpen, Settings, UserPlus, Users } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { useActiveProject } from '../lib/project';
import { useUi } from '../stores/ui';
import { cx, IconButton, Select, Toasts } from './ui';

const NAV = [
  { to: '/projects', key: 'projects', icon: FolderKanban, end: false },
  { to: '/characters', key: 'characters', icon: Users, end: false },
  { to: '/characters/new', key: 'creator', icon: UserPlus, end: true },
  { to: '/story', key: 'story', icon: Network, end: false },
  { to: '/dialogue', key: 'dialogue', icon: MessagesSquare },
  { to: '/scenarios', key: 'scenarios', icon: Orbit },
  { to: '/simulations', key: 'simulations', icon: Drama },
  { to: '/memory', key: 'memory', icon: Brain },
  { to: '/settings', key: 'settings', icon: Settings },
] as const;

/** Scorciatoia per nascondere/mostrare il pannello laterale. */
const SHORTCUT = 'Ctrl+\\';

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navHidden = useUi((s) => s.navHidden);
  const toggleNav = useUi((s) => s.toggleNav);

  // Ctrl+\ (⌘+\ su macOS) nasconde o mostra il pannello.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleNav();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleNav]);

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-panel focus:p-2">
        {t('common.skipToContent')}
      </a>
      {navHidden ? (
        // Pannello nascosto: resta solo una striscia sottile per riaprirlo.
        <div className="flex w-8 shrink-0 flex-col items-center border-r border-border bg-panel py-3 print:hidden">
          <IconButton label={`${t('nav.showPanel')} (${SHORTCUT})`} icon={<PanelLeftOpen className="size-4" />} onClick={toggleNav} aria-expanded={false} />
        </div>
      ) : (
        <nav id="app-nav" aria-label="PERSONA" className="flex w-14 shrink-0 flex-col border-r border-border bg-panel md:w-52 print:hidden">
          <div className="flex h-12 items-center justify-center gap-2 border-b border-border px-2 md:justify-start md:px-4">
            <BookUser className="hidden size-5 shrink-0 text-accent md:block" aria-hidden />
            <div className="hidden text-sm font-semibold tracking-[0.18em] md:block">{t('app.name')}</div>
            <IconButton
              label={`${t('nav.hidePanel')} (${SHORTCUT})`}
              icon={<PanelLeftClose className="size-4" />}
              className="md:ml-auto"
              onClick={toggleNav}
              aria-expanded
              aria-controls="app-nav"
            />
          </div>
          <ProjectSwitcher />
          <ul className="flex flex-1 flex-col gap-0.5 overflow-auto p-2">
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
      )}
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
        <div className="mb-1 px-0.5 text-[11px] text-muted">{t('projects.switcher')}</div>
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
