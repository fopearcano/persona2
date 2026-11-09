import type { Preferences } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

const put = (payload: object) => env.app.inject({ method: 'PUT', url: '/api/preferences', payload });

describe('style preferences', () => {
  it('starts from the default style', async () => {
    const prefs = (await env.app.inject({ method: 'GET', url: '/api/preferences' })).json() as Preferences;
    expect(prefs.appearance).toEqual({ fontUi: 'system', fontText: 'system', textSize: 'normal', accent: 'default', accentCustom: null });
  });

  it('saves fonts, size and accent, merging partial updates and surviving a restart', async () => {
    await put({ appearance: { fontText: 'typewriter', textSize: 'large' } });
    const res = await put({ appearance: { accent: 'custom', accentCustom: '#7C3AED' } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Preferences).appearance).toEqual({
      fontUi: 'system',
      fontText: 'typewriter',
      textSize: 'large',
      accent: 'custom',
      accentCustom: '#7c3aed',
    });
    // Le altre preferenze non vengono toccate.
    expect((res.json() as Preferences).theme).toBe('dark');
    await env.restart();
    const after = (await env.app.inject({ method: 'GET', url: '/api/preferences' })).json() as Preferences;
    expect(after.appearance.fontText).toBe('typewriter');
    expect(after.appearance.accentCustom).toBe('#7c3aed');
  });

  it('rejects unknown fonts, sizes, accents and malformed colors', async () => {
    for (const appearance of [{ fontUi: 'comic' }, { textSize: 'huge' }, { accent: 'pink' }, { accentCustom: 'red' }, { accentCustom: '#12345' }]) {
      const res = await put({ appearance });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('validation');
    }
    const prefs = (await env.app.inject({ method: 'GET', url: '/api/preferences' })).json() as Preferences;
    expect(prefs.appearance.accent).toBe('default');
  });
});
