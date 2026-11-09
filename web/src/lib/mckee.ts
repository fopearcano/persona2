import type { BuildContext, CastMember, Character } from '@persona/shared/client';
import { mckeeData, type McKeeCharacter, type McKeeData, type McKeeStory } from '@persona/shared/mckee';
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
