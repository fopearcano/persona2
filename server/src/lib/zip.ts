/**
 * Lettore ZIP minimo (sola lettura, metodi "stored" e "deflate") per i file EPUB.
 * Basato su node:zlib: nessuna dipendenza esterna. Non supporta ZIP64 né archivi cifrati.
 */
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export class ZipReader {
  readonly entries = new Map<string, ZipEntry>();

  constructor(private readonly buf: Buffer) {
    const eocd = this.findEocd();
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new Error('Invalid ZIP central directory');
      const method = buf.readUInt16LE(p + 10);
      const compressedSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      if (compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      this.entries.set(name, { name, method, compressedSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  private findEocd(): number {
    const min = Math.max(0, this.buf.length - 65557);
    for (let i = this.buf.length - 22; i >= min; i--) {
      if (this.buf.readUInt32LE(i) === EOCD_SIG) return i;
    }
    throw new Error('Not a ZIP file');
  }

  read(name: string): Buffer | null {
    const e = this.entries.get(name);
    if (!e) return null;
    const p = e.localOffset;
    if (this.buf.readUInt32LE(p) !== LOC_SIG) throw new Error(`Invalid ZIP entry: ${name}`);
    const start = p + 30 + this.buf.readUInt16LE(p + 26) + this.buf.readUInt16LE(p + 28);
    const data = this.buf.subarray(start, start + e.compressedSize);
    if (e.method === 0) return Buffer.from(data);
    if (e.method === 8) return inflateRawSync(data, { maxOutputLength: Math.max(e.size, 1) * 2 + 1024 });
    throw new Error(`Unsupported ZIP compression method ${e.method}`);
  }

  readText(name: string): string | null {
    return this.read(name)?.toString('utf8') ?? null;
  }
}
