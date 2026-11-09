import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanPdfText } from '../src/services/pdf.js';
import { createTestEnv, type TestEnv } from './helpers.js';

/** PDF minimo valido con una pagina di testo (Helvetica, Latin-1). */
export function makePdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td ${lines.map((l, i) => `${i ? '0 -16 Td ' : ''}(${l.replace(/[()\\]/g, (c) => '\\' + c)}) Tj`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

describe('PDF extraction', () => {
  it('extracts text from a PDF for the knowledge base', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/knowledge/extract-pdf?filename=Pulsar_note.pdf',
      headers: { 'content-type': 'application/pdf' },
      payload: makePdf(['Le pulsar millisecondo', 'sono orologi naturali.']),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ title: 'Pulsar note', pages: 1, text: 'Le pulsar millisecondo\nsono orologi naturali.' });
  });

  it('rejects files that are not PDFs', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/knowledge/extract-pdf?filename=x.pdf',
      headers: { 'content-type': 'application/pdf' },
      payload: Buffer.from('not a pdf'),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_pdf');
  });

  it('cleans hyphenation and whitespace', () => {
    expect(cleanPdfText('astro-\nfisica   teorica\n\n\n\nfine')).toBe('astrofisica teorica\n\nfine');
  });
});
