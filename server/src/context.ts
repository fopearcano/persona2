import type { AppConfig } from './config.js';
import type { DatabaseManager } from './db/client.js';
import type { ProviderFactory } from './llm/registry.js';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/** Dipendenze condivise dai servizi. I servizi leggono `ctx.dbm.db` a ogni uso. */
export interface AppContext {
  readonly dbm: DatabaseManager;
  readonly config: AppConfig;
  readonly providers: ProviderFactory;
  readonly log: Logger;
  /** Elaborazioni di memoria in background (per attenderle nei test e allo spegnimento). */
  readonly background: Set<Promise<unknown>>;
}

export function trackBackground(ctx: AppContext, task: Promise<unknown>): void {
  ctx.background.add(task);
  void task.finally(() => ctx.background.delete(task));
}

export async function settleBackground(ctx: AppContext): Promise<void> {
  while (ctx.background.size > 0) {
    await Promise.allSettled([...ctx.background]);
  }
}
