import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultDataDir, loadConfig } from '../src/config.js';
import { describeDataDirMove, moveLegacyDataDir, MOVED_MARKER } from '../src/lib/data-dir.js';

describe('default data folder', () => {
  it('uses the per-user folder of the operating system, like the desktop app', () => {
    expect(defaultDataDir({ APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming' }, 'win32', 'C:\\Users\\Ada')).toBe('C:\\Users\\Ada\\AppData\\Roaming\\PERSONA\\data');
    expect(defaultDataDir({}, 'win32', 'C:\\Users\\Ada')).toBe('C:\\Users\\Ada\\AppData\\Roaming\\PERSONA\\data');
    expect(defaultDataDir({}, 'darwin', '/Users/ada')).toBe('/Users/ada/Library/Application Support/PERSONA/data');
    expect(defaultDataDir({}, 'linux', '/home/ada')).toBe('/home/ada/.config/PERSONA/data');
    expect(defaultDataDir({ XDG_CONFIG_HOME: '/srv/cfg' }, 'linux', '/home/ada')).toBe('/srv/cfg/PERSONA/data');
  });

  it('is used when PERSONA_DATA_DIR is not set', () => {
    const saved = process.env.PERSONA_DATA_DIR;
    process.env.PERSONA_DATA_DIR = '';
    try {
      const config = loadConfig();
      expect(config.dataDir).toBe(defaultDataDir());
      expect(config.databaseFile).toBe(join(defaultDataDir(), 'persona.db'));
    } finally {
      if (saved === undefined) delete process.env.PERSONA_DATA_DIR;
      else process.env.PERSONA_DATA_DIR = saved;
    }
  });
});

describe('moving the old data folder out of the repository', () => {
  let root: string;
  let legacy: string;
  let target: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'persona-datadir-'));
    legacy = join(root, 'repo', 'data');
    target = join(root, 'home', '.config', 'PERSONA', 'data');
    mkdirSync(join(legacy, 'backups'), { recursive: true });
    writeFileSync(join(legacy, 'persona.db'), 'db');
    writeFileSync(join(legacy, 'persona.db-wal'), 'wal');
    writeFileSync(join(legacy, 'backups', 'b1.db'), 'backup');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('copies everything and keeps the old folder as a renamed safety copy', () => {
    const r = moveLegacyDataDir(legacy, target, new Date('2026-11-11T10:20:30Z'));
    expect(r).toMatchObject({ action: 'moved', to: target, backup: `${legacy}.moved-2026-11-11-10-20-30` });
    expect(readFileSync(join(target, 'persona.db'), 'utf8')).toBe('db');
    expect(readFileSync(join(target, 'persona.db-wal'), 'utf8')).toBe('wal');
    expect(readFileSync(join(target, 'backups', 'b1.db'), 'utf8')).toBe('backup');
    expect(existsSync(legacy)).toBe(false);
    expect(readFileSync(join(`${legacy}.moved-2026-11-11-10-20-30`, 'persona.db'), 'utf8')).toBe('db');
    expect(describeDataDirMove(r)).toContain(target);
    // Al secondo avvio non c'è più nulla da fare.
    expect(moveLegacyDataDir(legacy, target)).toEqual({ action: 'none' });
  });

  it('keeps files already in the new folder (e.g. the uploaded book)', () => {
    mkdirSync(join(target, 'books'), { recursive: true });
    writeFileSync(join(target, 'books', 'mckee.epub'), 'epub');
    writeFileSync(join(target, 'persona.db-wal'), 'newer');
    expect(moveLegacyDataDir(legacy, target).action).toBe('moved');
    expect(readFileSync(join(target, 'books', 'mckee.epub'), 'utf8')).toBe('epub');
    expect(readFileSync(join(target, 'persona.db-wal'), 'utf8')).toBe('newer');
  });

  it('never overwrites an existing database and leaves the old folder alone', () => {
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'persona.db'), 'current');
    const r = moveLegacyDataDir(legacy, target);
    expect(r.action).toBe('conflict');
    expect(readFileSync(join(target, 'persona.db'), 'utf8')).toBe('current');
    expect(readFileSync(join(legacy, 'persona.db'), 'utf8')).toBe('db');
    expect(describeDataDirMove(r)).toContain('PERSONA_DATA_DIR=');
  });

  it('does nothing without an old database, or when the old folder is marked as moved', () => {
    rmSync(legacy, { recursive: true });
    expect(moveLegacyDataDir(legacy, target)).toEqual({ action: 'none' });
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'persona.db'), 'db');
    writeFileSync(join(legacy, MOVED_MARKER), 'x');
    expect(moveLegacyDataDir(legacy, target)).toEqual({ action: 'none' });
    expect(existsSync(target)).toBe(false);
    expect(moveLegacyDataDir(target, target)).toEqual({ action: 'none' });
    expect(readdirSync(root)).toEqual(['repo']);
  });
});
