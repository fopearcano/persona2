import { describe, expect, it } from 'vitest';
import { SseParser } from './client';

describe('SseParser', () => {
  it('parses events split across arbitrary chunks', () => {
    const p = new SseParser();
    const raw =
      'event: delta\ndata: {"type":"delta","text":"Cia"}\n\nevent: delta\ndata: {"type":"delta","text":"o"}\n\nevent: done\ndata: {"type":"done","message":null}\n\n';
    const out = [];
    for (let i = 0; i < raw.length; i += 7) out.push(...p.push(raw.slice(i, i + 7)));
    expect(out.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
    expect(out.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('Ciao');
  });

  it('ignores malformed events', () => {
    const p = new SseParser();
    expect(p.push('data: {not json}\n\ndata: {"type":"delta","text":"x"}\n\n')).toHaveLength(1);
  });
});
