import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider } from '../src/llm/openai-compatible.js';
import { resolveModelId } from '../src/llm/registry.js';
import { ThinkFilter } from '../src/llm/think-filter.js';
import { collectChat, LlmError } from '../src/llm/types.js';

/** Server finto che imita le API di LM Studio (OpenAI-compatibili + REST nativa). */
let server: Server;
let base = '';
let lastBody: Record<string, unknown> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/v0/models') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            data: [
              { id: 'text-embedding-x', state: 'not-loaded', type: 'embeddings' },
              { id: 'qwen-local', state: 'loaded', max_context_length: 32768, type: 'llm' },
            ],
          }),
        );
        return;
      }
      if (req.url === '/v1/models') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'qwen-local' }] }));
        return;
      }
      if (req.url === '/v1/embeddings') {
        const input = (JSON.parse(body) as { input: string[] }).input;
        res.setHeader('Content-Type', 'application/json');
        // Ordine invertito di proposito: il client deve riordinare per indice.
        res.end(JSON.stringify({ data: input.map((t, i) => ({ index: i, embedding: [t.length, i] })).reverse() }));
        return;
      }
      if (req.url === '/v1/chat/completions') {
        lastBody = JSON.parse(body);
        if (lastBody.model === 'missing') {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: { message: 'model "missing" not found' } }));
          return;
        }
        if (lastBody.model === 'auth') {
          res.statusCode = 401;
          res.end('unauthorized');
          return;
        }
        res.setHeader('Content-Type', 'text/event-stream');
        const chunks = [
          { choices: [{ delta: { reasoning_content: 'pensiero ' } }] },
          { choices: [{ delta: { content: '<thi' } }] },
          { choices: [{ delta: { content: 'nk>nascosto</think>Ciao ' } }] },
          { choices: [{ delta: { content: 'dal mondo' } }] },
        ];
        // Spezza deliberatamente le righe SSE tra pacchetti TCP diversi.
        const payload = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
        res.write(payload.slice(0, 37));
        setTimeout(() => {
          res.write(payload.slice(37));
          res.end();
        }, 10);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => {
  server.close();
});

describe('ThinkFilter', () => {
  it('separates think blocks even when tags are split across chunks', () => {
    const f = new ThinkFilter();
    const out = [...f.push('Ciao <th'), ...f.push('ink>segreto</th'), ...f.push('ink> mondo'), ...f.flush()];
    const content = out.filter((c) => c.type === 'content').map((c) => c.text).join('');
    const reasoning = out.filter((c) => c.type === 'reasoning').map((c) => c.text).join('');
    expect(content).toBe('Ciao  mondo');
    expect(reasoning).toBe('segreto');
  });
});

describe('OpenAI-compatible provider (LM Studio)', () => {
  it('lists models using the LM Studio native API and picks the loaded LLM', async () => {
    const p = new OpenAICompatibleProvider({ type: 'lmstudio', baseUrl: base });
    const models = await p.listModels();
    expect(models.find((m) => m.id === 'qwen-local')).toMatchObject({ loaded: true, contextLength: 32768 });
    expect(await resolveModelId(p, '')).toBe('qwen-local');
    expect(await resolveModelId(p, 'explicit')).toBe('explicit');
  });

  it('streams content, separating reasoning', async () => {
    const p = new OpenAICompatibleProvider({ type: 'lmstudio', baseUrl: base });
    const res = await collectChat(p, [{ role: 'user', content: 'hi' }], { model: 'qwen-local', temperature: 0.5, maxTokens: 64 });
    expect(res.content).toBe('Ciao dal mondo');
    expect(res.reasoning).toBe('pensiero nascosto');
    expect(lastBody).toMatchObject({ model: 'qwen-local', stream: true, temperature: 0.5, max_tokens: 64 });
  });

  it('maps HTTP errors to stable error codes', async () => {
    const p = new OpenAICompatibleProvider({ type: 'openai-compatible', baseUrl: base });
    await expect(collectChat(p, [{ role: 'user', content: 'x' }], { model: 'missing' })).rejects.toMatchObject({ code: 'llm_model_not_found' });
    await expect(collectChat(p, [{ role: 'user', content: 'x' }], { model: 'auth' })).rejects.toMatchObject({ code: 'llm_auth' });
    const down = new OpenAICompatibleProvider({ type: 'lmstudio', baseUrl: 'http://127.0.0.1:9/v1' });
    await expect(down.listModels()).rejects.toBeInstanceOf(LlmError);
  });

  it('computes embeddings in input order', async () => {
    const p = new OpenAICompatibleProvider({ type: 'lmstudio', baseUrl: base });
    expect(await p.embed(['ab', 'abcd'], 'text-embedding-x')).toEqual([
      [2, 0],
      [4, 1],
    ]);
  });

  it('supports cancellation', async () => {
    const p = new OpenAICompatibleProvider({ type: 'lmstudio', baseUrl: base });
    const controller = new AbortController();
    controller.abort();
    await expect(collectChat(p, [{ role: 'user', content: 'x' }], { model: 'qwen-local' }, controller.signal)).rejects.toMatchObject({
      code: 'aborted',
    });
  });
});
