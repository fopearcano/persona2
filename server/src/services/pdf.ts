/**
 * Estrazione del testo da PDF per la base di conoscenza (unpdf / pdf.js, senza dipendenze native).
 * Solo PDF con testo selezionabile: i documenti scansionati richiederebbero OCR (non incluso).
 */
import type { PdfExtraction } from '@persona/shared';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../lib/util.js';

const MAX_BYTES = 50 * 1024 * 1024;

/** Ricompone righe e paragrafi: unisce le sillabazioni a fine riga e riduce gli spazi. */
export function cleanPdfText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/([\p{L}])-\n(\p{Ll})/gu, '$1$2')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPdf(buffer: Buffer, fileName: string): Promise<PdfExtraction> {
  if (buffer.length > MAX_BYTES) throw new AppError('invalid_pdf', 'PDF troppo grande (max 50 MB)', 413);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new AppError('invalid_pdf', 'Il file non è un PDF', 400);
  let pages = 0;
  let text = '';
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const res = await extractText(pdf, { mergePages: false });
    pages = res.totalPages;
    text = cleanPdfText((res.text as string[]).join('\n\n'));
  } catch (err) {
    throw new AppError('invalid_pdf', `PDF non leggibile: ${(err as Error).message}`, 400);
  }
  if (!text) throw new AppError('invalid_pdf', 'Nessun testo estraibile (PDF scansionato?)', 422);
  const title = fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'PDF';
  return { title, pages, text };
}
