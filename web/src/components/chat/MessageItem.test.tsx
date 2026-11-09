import type { Message } from '@persona/shared/client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { MessageItem, RichText } from './MessageItem';

const base: Message = {
  id: 'm1',
  conversationId: 'c1',
  seq: 1,
  role: 'character',
  characterId: 'x',
  speakerName: 'Irina Volkova',
  content: 'Ciao',
  reasoning: null,
  mode: 'dialogue',
  language: null,
  status: 'complete',
  providerType: 'mock',
  model: 'mock-persona',
  contextMeta: null,
  regeneratedFromId: null,
  editedAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};
const actions = { onRegenerate() {}, onEdited() {}, onDelete() {}, onInspect() {} };

beforeAll(async () => {
  await i18n.changeLanguage('it');
});
afterEach(cleanup);

describe('message rendering', () => {
  it('never injects HTML from generated content', () => {
    const { container } = render(<RichText text={'<img src=x onerror=alert(1)> *corsivo* **forte**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('em')?.textContent).toBe('corsivo');
    expect(container.querySelector('strong')?.textContent).toBe('forte');
  });

  it('labels external analysis as not being character speech', () => {
    render(<MessageItem message={{ ...base, role: 'analysis', content: 'Valutazione' }} actions={actions} busy={false} selected={false} />);
    expect(screen.getByText('Analisi esterna · non è parlato del personaggio')).toBeTruthy();
  });

  it('shows the speaker name and a localized incomplete notice', async () => {
    render(<MessageItem message={{ ...base, status: 'incomplete' }} actions={actions} busy={false} selected={false} />);
    expect(screen.getByText('Irina Volkova')).toBeTruthy();
    expect(screen.getByText(/testo parziale/)).toBeTruthy();
    await i18n.changeLanguage('en');
    cleanup();
    render(<MessageItem message={{ ...base, status: 'incomplete' }} actions={actions} busy={false} selected={false} />);
    expect(screen.getByText(/partial text was saved/)).toBeTruthy();
    await i18n.changeLanguage('it');
  });
});
