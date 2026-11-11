/**
 * Rilevamento delle cartelle dei servizi cloud installati sul computer (Google Drive per
 * desktop, Dropbox, OneDrive, iCloud Drive, Nextcloud, Syncthing). Solo suggerimenti: la
 * cartella si può sempre scrivere a mano.
 */
import type { SyncFolderSuggestion } from '@persona/shared';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface DetectOptions {
  platform?: NodeJS.Platform;
  home?: string;
  env?: Record<string, string | undefined>;
  isDir?: (p: string) => boolean;
  list?: (p: string) => string[];
}

/** Nome della cartella principale di Google Drive per desktop nelle varie lingue. */
const GOOGLE_MY_DRIVE = ['My Drive', 'Il mio Drive', 'Mi unidad', 'Meine Ablage', 'Mon Drive', 'Meu Drive'];
export const PERSONA_SUBFOLDER = 'PERSONA';

const LABELS: Record<string, string> = {
  'google-drive': 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  icloud: 'iCloud Drive',
  nextcloud: 'Nextcloud',
  syncthing: 'Syncthing',
};

const defaultIsDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const defaultList = (p: string) => {
  try {
    return existsSync(p) ? readdirSync(p) : [];
  } catch {
    return [];
  }
};

export function detectSyncFolders(opts: DetectOptions = {}): SyncFolderSuggestion[] {
  const platform = opts.platform ?? process.platform;
  const p = platform === 'win32' ? path.win32 : path.posix;
  const home = opts.home ?? homedir();
  const env = opts.env ?? process.env;
  const isDir = opts.isDir ?? defaultIsDir;
  const list = opts.list ?? defaultList;

  const found: SyncFolderSuggestion[] = [];
  const seen = new Set<string>();
  const add = (provider: string, root: string) => {
    if (seen.has(root) || !isDir(root)) return;
    seen.add(root);
    found.push({ provider, label: LABELS[provider] ?? provider, root, path: p.join(root, PERSONA_SUBFOLDER) });
  };
  const addMyDrive = (base: string) => {
    for (const name of GOOGLE_MY_DRIVE) add('google-drive', p.join(base, name));
  };

  if (platform === 'win32') {
    // Google Drive per desktop monta un'unità virtuale (di solito G:).
    for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') addMyDrive(`${letter}:\\`);
    add('google-drive', p.join(home, 'Google Drive'));
    add('dropbox', p.join(home, 'Dropbox'));
    for (const v of [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial]) if (v) add('onedrive', v);
    add('onedrive', p.join(home, 'OneDrive'));
    add('icloud', p.join(home, 'iCloudDrive'));
    add('nextcloud', p.join(home, 'Nextcloud'));
  } else if (platform === 'darwin') {
    const cloud = p.join(home, 'Library', 'CloudStorage');
    for (const entry of list(cloud)) {
      const base = p.join(cloud, entry);
      if (entry.startsWith('GoogleDrive-')) addMyDrive(base);
      else if (entry === 'Dropbox' || entry.startsWith('Dropbox-')) add('dropbox', base);
      else if (entry.startsWith('OneDrive')) add('onedrive', base);
    }
    add('icloud', p.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
    add('google-drive', p.join(home, 'Google Drive'));
    add('dropbox', p.join(home, 'Dropbox'));
    add('nextcloud', p.join(home, 'Nextcloud'));
  } else {
    // Linux: nessun client ufficiale di Google Drive; cartelle comuni di rclone, Insync e altri.
    for (const name of ['Google Drive', 'GoogleDrive', 'gdrive']) add('google-drive', p.join(home, name));
    add('dropbox', p.join(home, 'Dropbox'));
    add('onedrive', p.join(home, 'OneDrive'));
    add('nextcloud', p.join(home, 'Nextcloud'));
    add('syncthing', p.join(home, 'Sync'));
  }
  return found;
}
