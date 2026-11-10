import type { BuildContext, CastMember, Character, CoachUpdate } from '@persona/shared/client';
import {
  applyUpdates,
  getPath,
  IDENTITY_KEYS,
  isIdentityPath,
  isPlainObject,
  mckeeData,
  setPath,
  type CharacterBuild,
  type McKeeCharacter,
  type McKeeData,
  type McKeeStory,
} from '@persona/shared/mckee';
import { useTranslation } from 'react-i18next';

/**
 * Contenuti McKee (stazioni, catalogo, verifiche, infografiche) nella lingua dell'interfaccia.
 * Esistono in inglese e in italiano; le altre lingue mostrano l'inglese (vedi README).
 */
export function useMckee(): McKeeData {
  const { i18n } = useTranslation();
  return mckeeData(i18n.language);
}

export function toMcKee(c: Pick<Character, 'id' | 'name' | 'build'> | CastMember): McKeeCharacter {
  return { ...c.build, id: c.id, name: c.name };
}

export function storyOf(ctx: BuildContext | undefined | null): McKeeStory | null {
  return ctx?.project ? { ...ctx.project.story, id: ctx.project.id, title: ctx.project.name } : null;
}

export const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function trunc(s: unknown, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Scarica un testo come file (export Markdown generato nel browser). */
export function downloadText(fileName: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text: string, fallback = 'persona'): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

/* ------------------------------------------------------------------ */
/* Assistente di costruzione: applicazione e annullamento              */
/* ------------------------------------------------------------------ */

/** Bozza dei campi dell'identità che l'assistente può compilare (nome, età, professione…). */
export type IdentityDraft = Record<string, string | null>;

export function identityDraftOf(c: Character): IdentityDraft {
  const rec = c as unknown as Record<string, string | null>;
  return Object.fromEntries(IDENTITY_KEYS.map((k) => [k, rec[k] ?? null]));
}

/** Valori precedenti dei campi toccati da una proposta, per annullarla. */
export interface CaptureUndo {
  build: { path: string; existed: boolean; prev: unknown }[];
  identity: { key: string; prev: string | null }[];
}

/** Applica alla bozza (costruzione + identità) gli aggiornamenti dell'assistente e restituisce come annullarli. */
export function applyCapture(build: CharacterBuild, identity: IdentityDraft, updates: Pick<CoachUpdate, 'path' | 'op' | 'value'>[]) {
  const undo: CaptureUndo = { build: [], identity: [] };
  const buildUpdates = updates.filter((u) => !isIdentityPath(u.path));
  for (const u of buildUpdates) {
    if (undo.build.some((x) => x.path === u.path)) continue;
    const parent = getPath(build, u.path.split('.').slice(0, -1).join('.'));
    const key = u.path.split('.').pop()!;
    const existed = isPlainObject(parent) ? Object.prototype.hasOwnProperty.call(parent, key) : getPath(build, u.path) !== undefined;
    undo.build.push({ path: u.path, existed, prev: structuredClone(getPath(build, u.path) ?? null) });
  }
  const nextIdentity = { ...identity };
  for (const u of updates.filter((x) => isIdentityPath(x.path))) {
    const key = u.path.slice('identity.'.length);
    if (!undo.identity.some((x) => x.key === key)) undo.identity.push({ key, prev: identity[key] ?? null });
    nextIdentity[key] = String(u.value ?? '');
  }
  return { build: buildUpdates.length ? applyUpdates(build, buildUpdates) : build, identity: nextIdentity, undo };
}

/** Ripristina i valori precedenti a una proposta applicata. */
export function undoCapture(build: CharacterBuild, identity: IdentityDraft, undo: CaptureUndo) {
  const next = structuredClone(build);
  for (const x of [...undo.build].reverse()) {
    if (x.existed) setPath(next, x.path, structuredClone(x.prev));
    else {
      const parent = getPath(next, x.path.split('.').slice(0, -1).join('.'));
      if (isPlainObject(parent)) delete parent[x.path.split('.').pop()!];
    }
  }
  const nextIdentity = { ...identity };
  for (const x of undo.identity) nextIdentity[x.key] = x.prev;
  return { build: next, identity: nextIdentity };
}
