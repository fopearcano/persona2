/**
 * Spostamento una tantum della cartella dati delle versioni precedenti.
 *
 * Fino alla 2.0 PERSONA avviato dai sorgenti teneva i dati in `<repository>/data`: clonando
 * di nuovo il progetto (o reinstallandolo) i dati sembravano spariti. Ora la cartella
 * predefinita è quella utente del sistema (vedi `defaultDataDir`). Al primo avvio, se il
 * repository contiene ancora un database e la nuova cartella no, i dati vengono copiati
 * nella nuova cartella e quella vecchia viene rinominata come copia di sicurezza
 * (`data.moved-<data>`), mai cancellata.
 */
import { cpSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DB_FILE = 'persona.db';
/** Scritto nella cartella vecchia se non si riesce a rinominarla (es. file aperti su Windows). */
export const MOVED_MARKER = 'SPOSTATA-LEGGIMI.txt';

export type DataDirMove =
  | { action: 'none' }
  | { action: 'moved'; from: string; to: string; backup: string }
  /** Database presente in entrambe le cartelle: si usa quella nuova, la vecchia resta com'è. */
  | { action: 'conflict'; from: string; to: string };

function stamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function moveLegacyDataDir(legacyDir: string, targetDir: string, now = new Date()): DataDirMove {
  const from = resolve(legacyDir);
  const to = resolve(targetDir);
  if (from === to || !existsSync(join(from, DB_FILE)) || existsSync(join(from, MOVED_MARKER))) return { action: 'none' };
  if (existsSync(join(to, DB_FILE))) return { action: 'conflict', from, to };

  mkdirSync(to, { recursive: true });
  // Copia tutto (database con eventuali file -wal/-shm, backup, libro); non sovrascrive nulla
  // di ciò che c'è già nella nuova cartella.
  cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
  if (!existsSync(join(to, DB_FILE))) throw new Error(`Copia dei dati non riuscita da ${from} a ${to}`);

  let backup = `${from}.moved-${stamp(now)}`;
  try {
    renameSync(from, backup);
  } catch {
    // Cartella in uso: resta dov'è, con una nota che impedisce di spostarla di nuovo.
    backup = from;
    writeFileSync(
      join(from, MOVED_MARKER),
      `I dati di PERSONA sono stati copiati il ${now.toISOString()} in:\n${to}\n\nQuesta cartella non viene più usata e si può eliminare.\n`,
    );
  }
  return { action: 'moved', from, to, backup };
}

/** Messaggio da mostrare all'avvio (null se non c'è nulla da segnalare). */
export function describeDataDirMove(r: DataDirMove): string | null {
  switch (r.action) {
    case 'moved':
      return `Dati spostati da ${r.from} a ${r.to}. La cartella precedente resta come copia di sicurezza: ${r.backup}`;
    case 'conflict':
      return `C'è anche un database in ${r.from}, che non viene usato: i dati attivi sono in ${r.to}. Per usare quello vecchio imposta PERSONA_DATA_DIR=${r.from}`;
    default:
      return null;
  }
}
