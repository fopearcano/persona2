import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

describe('local-only access', () => {
  it('rejects requests addressed to foreign hosts (DNS rebinding)', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/characters', headers: { host: 'evil.example:4317' } });
    expect(res.statusCode).toBe(403);
    const ok = await env.app.inject({ method: 'GET', url: '/api/characters', headers: { host: '127.0.0.1:4317' } });
    expect(ok.statusCode).toBe(200);
  });

  it('rejects state-changing requests from other origins', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: 'https://evil.example', host: 'localhost:4317' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
    const same = await env.app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: 'http://localhost:5173', host: 'localhost:5173' },
      payload: { name: 'X' },
    });
    expect(same.statusCode).toBe(201);
  });

  it('does not accept text/plain bodies (form-based CSRF)', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { 'content-type': 'text/plain' },
      payload: JSON.stringify({ name: 'X' }),
    });
    expect(res.statusCode).toBe(415);
  });
});
