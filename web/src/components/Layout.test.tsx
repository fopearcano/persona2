import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { useUi } from '../stores/ui';
import { Layout } from './Layout';

beforeAll(async () => {
  await i18n.changeLanguage('it');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'content-type': 'application/json' } })));
});
afterEach(() => {
  cleanup();
  if (useUi.getState().navHidden) useUi.getState().toggleNav();
});

function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/characters']}>
        <Layout>
          <p>contenuto</p>
        </Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('left panel', () => {
  it('has no tagline nor project-management link', () => {
    renderLayout();
    expect(screen.queryByText('Laboratorio di identità persistenti')).toBeNull();
    expect(screen.queryByText('Gestisci progetti')).toBeNull();
    expect(screen.getByText('Progetto attivo')).toBeTruthy();
  });

  it('can be hidden and shown again, and remembers it', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Nascondi il pannello/ }));
    expect(screen.queryByRole('navigation', { name: 'PERSONA' })).toBeNull();
    expect(screen.getByText('contenuto')).toBeTruthy();
    expect(localStorage.getItem('persona.navHidden')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /Mostra il pannello/ }));
    expect(screen.getByRole('navigation', { name: 'PERSONA' })).toBeTruthy();
    expect(localStorage.getItem('persona.navHidden')).toBeNull();
  });

  it('toggles with Ctrl+\\', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    expect(screen.queryByRole('navigation', { name: 'PERSONA' })).toBeNull();
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(screen.getByRole('navigation', { name: 'PERSONA' })).toBeTruthy();
  });
});
