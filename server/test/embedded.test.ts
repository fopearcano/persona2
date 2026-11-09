import type { StreamEvent } from '@persona/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startPersonaServer } from '../src/embedded.js';
import { parseSse } from './helpers.js';

describe('embedded server (Electron-ready entry point)', () => {
  it('starts on a free port, streams over real HTTP and shuts down cleanly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-embedded-'));
    const server = await startPersonaServer({ dataDir: dir, port: 0, webDistDir: null, config: { mockDelayMs: 5 } });
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.ctx.dbm.file).toBe(join(dir, 'persona.db'));
      const json = (path: string, body?: unknown) =>
        fetch(server.url + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined).then((r) =>
          r.json(),
        );
      expect(await json('/api/health')).toMatchObject({ ok: true });
      const configs = (await json('/api/model-configs')) as { id: string; providerType: string }[];
      const mock = configs.find((c) => c.providerType === 'mock')!;
      const character = (await json('/api/characters', { name: 'Ada', modelConfigId: mock.id })) as { id: string };
      const conv = (await json('/api/conversations', { kind: 'lab', characterId: character.id })) as { id: string };

      const res = await fetch(`${server.url}/api/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'Ciao Ada' }),
      });
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      let raw = '';
      let chunks = 0;
      const reader = res.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks++;
        raw += new TextDecoder().decode(value);
      }
      const events = parseSse(raw) as StreamEvent[];
      expect(chunks).toBeGreaterThan(2); // risposta realmente incrementale
      expect(events.at(-1)?.type).toBe('done');
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
