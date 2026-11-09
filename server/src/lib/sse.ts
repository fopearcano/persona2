import type { StreamEvent } from '@persona/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './util.js';

/**
 * Esegue un'operazione in streaming (Server-Sent Events su POST).
 * Se il client si disconnette, l'operazione viene annullata tramite AbortSignal:
 * il testo parziale resta comunque salvato dal servizio.
 */
export async function streamResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  run: (sink: { send(e: StreamEvent): void }, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let ended = false;
  res.on('close', () => {
    if (!ended) controller.abort(new Error('client disconnected'));
  });
  const sink = {
    send(e: StreamEvent) {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    },
  };
  try {
    await run(sink, controller.signal);
  } catch (err) {
    const code = err instanceof AppError ? err.code : 'internal';
    const message = (err as Error)?.message ?? String(err);
    if (!(err instanceof AppError)) request.log.error(err);
    sink.send({ type: 'error', error: { code, message }, message: null });
  } finally {
    ended = true;
    if (!res.writableEnded) res.end();
  }
}
