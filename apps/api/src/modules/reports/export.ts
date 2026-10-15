import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatNumber, formatPaise } from '@site-diary/shared';
import { readLocal, signedUrl } from '../../lib/storage';
import type { Fmt, Report, Table } from './report';

// ---------- Excel ----------

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const NUM_FMT: Partial<Record<Fmt, string>> = { int: '#,##0', qty: '#,##0.###', money: '"₹"#,##,##0.00', pct: '0%', date: 'dd mmm yyyy' };

export async function toXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(r.generatedAt);
  const used = new Set<string>();
  for (const tb of r.tables) {
    let name = tb.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Sheet';
    while (used.has(name)) name = `${name.slice(0, 26)} ${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = tb.columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(10, c.header.length + 2, (c.width ?? 1) * 12) }));
    for (const row of tb.rows) {
      ws.addRow(Object.fromEntries(tb.columns.map((c) => {
        const v = row[c.key];
        if (v == null) return [c.key, null];
        if (c.fmt === 'money') return [c.key, Number(v) / 100];
        if (c.fmt === 'date' && typeof v === 'string' && ISO.test(v)) return [c.key, new Date(`${v}T00:00:00Z`)];
        return [c.key, v];
      })));
    }
    tb.columns.forEach((c, i) => {
      const f = c.fmt && NUM_FMT[c.fmt];
      if (f) ws.getColumn(i + 1).numFmt = f;
    });
    ws.getRow(1).font = { bold: true };
    if (tb.totals && tb.rows.length) {
      const total: Record<string, unknown> = { [tb.columns[0]!.key]: 'Total' };
      for (const k of tb.totals) {
        const sum = tb.rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
        total[k] = tb.columns.find((c) => c.key === k)?.fmt === 'money' ? sum / 100 : sum;
      }
      ws.addRow(total).font = { bold: true };
    }
  }
  const about = wb.addWorksheet('About');
  about.addRows([['Company', r.company], ['Report', r.title], ['For', r.subtitle], ['Generated', new Date(r.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]]);
  about.getColumn(1).width = 14;
  about.getColumn(2).width = 60;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- PDF ----------
// Noto Sans (OFL) in three scripts: Latin, Gujarati (also has ₹) and Devanagari. Text is split into runs by script.

const FONT_DIR = path.resolve(__dirname, '../../../assets/fonts');
const FONTS = {
  lat: 'noto-sans-latin-400-normal.woff', latB: 'noto-sans-latin-700-normal.woff',
  gu: 'noto-sans-gujarati-gujarati-400-normal.woff', guB: 'noto-sans-gujarati-gujarati-700-normal.woff',
  hi: 'noto-sans-devanagari-400-normal.woff', hiB: 'noto-sans-devanagari-700-normal.woff',
};
type Script = 'lat' | 'gu' | 'hi';
const scriptOf = (ch: string): Script | null => {
  const c = ch.codePointAt(0)!;
  if (c >= 0x0a80 && c <= 0x0aff) return 'gu';
  if (c >= 0x0900 && c <= 0x097f) return 'hi';
  if (c === 0x20b9) return 'gu';
  if (c === 0x20 || (c >= 0x200c && c <= 0x200d)) return null; // spaces and joiners stay with the current run
  return 'lat';
};
function runs(text: string): [Script, string][] {
  const out: [Script, string][] = [];
  for (const ch of text) {
    const s = scriptOf(ch) ?? out.at(-1)?.[0] ?? 'lat';
    const last = out.at(-1);
    if (last && last[0] === s) last[1] += ch;
    else out.push([s, ch]);
  }
  return out;
}

const INK = '#1C1917';
const MUTED = '#57534E';
const LINE = '#E7E5E4';
const BRAND = '#C2410C';
const PAGE = { w: 595.28, h: 841.89, m: 36 };
const USABLE = PAGE.w - PAGE.m * 2;

type Doc = PDFKit.PDFDocument;

// Runs are placed one after another by measured width (pdfkit's "continued" text misplaces aligned runs).
function write(doc: Doc, text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: string; width?: number; align?: 'left' | 'right' } = {}) {
  doc.fontSize(opts.size ?? 9).fillColor(opts.color ?? INK);
  const parts = runs(text || '').map(([s, t]) => {
    const font = opts.bold ? `${s}B` : s;
    doc.font(font);
    return { font, t, w: doc.widthOfString(t) };
  });
  const total = parts.reduce((a, p) => a + p.w, 0);
  let cx = opts.align === 'right' && opts.width ? x + Math.max(0, opts.width - total) : x;
  for (const p of parts) {
    doc.font(p.font).text(p.t, cx, y, { lineBreak: false });
    cx += p.w;
  }
}

const cell = (v: unknown, fmt?: Fmt): string => {
  if (v == null || v === '') return '';
  if (fmt === 'money') return formatPaise(Number(v));
  if (fmt === 'int' || fmt === 'qty') return formatNumber(Number(v));
  if (fmt === 'date' && typeof v === 'string' && ISO.test(v)) return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${v}T00:00:00Z`));
  return String(v);
};

function table(doc: Doc, tb: Table) {
  const weights = tb.columns.map((c) => c.width ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * USABLE);
  const rowH = 16;
  const ensure = (h: number) => {
    if (doc.y + h > PAGE.h - PAGE.m) doc.addPage();
  };
  ensure(48);
  const titleY = doc.y + 10;
  write(doc, tb.title, PAGE.m, titleY, { size: 11, bold: true });
  doc.y = titleY + 22;
  const header = () => {
    let x = PAGE.m;
    const y = doc.y;
    tb.columns.forEach((c, i) => {
      const right = ['int', 'qty', 'money'].includes(c.fmt ?? '');
      doc.save().rect(x, y - 2, widths[i]! - 2, rowH).clip();
      write(doc, c.header, x + 2, y, { size: 8, bold: true, color: MUTED, width: widths[i]! - 4, align: right ? 'right' : 'left' });
      doc.restore();
      x += widths[i]!;
    });
    doc.y = y + rowH;
    doc.moveTo(PAGE.m, doc.y - 3).lineTo(PAGE.m + USABLE, doc.y - 3).strokeColor(LINE).stroke();
  };
  if (tb.columns.some((c) => c.header)) header();
  const body = [...tb.rows];
  if (tb.totals && tb.rows.length) {
    body.push({ [tb.columns[0]!.key]: 'Total', ...Object.fromEntries(tb.totals.map((k) => [k, tb.rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)])), __total: true });
  }
  if (!body.length) {
    write(doc, '—', PAGE.m + 2, doc.y, { color: MUTED });
    doc.y += rowH;
  }
  for (const row of body) {
    if (doc.y + rowH > PAGE.h - PAGE.m) {
      doc.addPage();
      header();
    }
    let x = PAGE.m;
    const y = doc.y;
    tb.columns.forEach((c, i) => {
      const right = ['int', 'qty', 'money'].includes(c.fmt ?? '');
      const text = cell(row[c.key], c.fmt);
      doc.save().rect(x, y - 1, widths[i]!, rowH).clip();
      write(doc, text, x + 2, y, { size: 8.5, bold: !!row.__total, width: widths[i]! - 4, align: right ? 'right' : 'left' });
      doc.restore();
      x += widths[i]!;
    });
    doc.y = y + rowH;
  }
}

async function image(key: string): Promise<Buffer | null> {
  try {
    const url = await signedUrl(key);
    if (url) return Buffer.from(await (await fetch(url)).arrayBuffer());
    return await readLocal(key);
  } catch {
    return null;
  }
}

export async function toPdf(r: Report): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.m, bufferPages: true, info: { Title: r.title, Author: r.company } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.rect(0, 0, PAGE.w, 6).fill(BRAND);
  write(doc, r.company, PAGE.m, PAGE.m, { size: 9, color: MUTED });
  write(doc, r.title, PAGE.m, PAGE.m + 14, { size: 18, bold: true });
  write(doc, r.subtitle, PAGE.m, PAGE.m + 40, { size: 10, color: MUTED });
  doc.y = PAGE.m + 62;

  if (r.highlights.length) {
    const w = USABLE / Math.min(r.highlights.length, 5);
    const y = doc.y;
    r.highlights.slice(0, 5).forEach((h, i) => {
      const x = PAGE.m + i * w;
      doc.roundedRect(x + 2, y, w - 4, 44, 6).strokeColor(LINE).stroke();
      write(doc, h.value, x + 10, y + 6, { size: 15, bold: true });
      write(doc, h.label, x + 10, y + 28, { size: 8, color: MUTED });
    });
    doc.y = y + 56;
  }
  for (const tb of r.tables) table(doc, tb);

  if (r.photos?.length) {
    if (doc.y + 200 > PAGE.h - PAGE.m) doc.addPage();
    const titleY = doc.y + 10;
    write(doc, 'Photos', PAGE.m, titleY, { size: 11, bold: true });
    doc.y = titleY + 22;
    const size = (USABLE - 16) / 3;
    let i = 0;
    for (const p of r.photos) {
      const buf = await image(p.storageKey);
      if (!buf) continue;
      const col = i % 3;
      if (col === 0 && i > 0) doc.y += size + 22;
      if (doc.y + size + 20 > PAGE.h - PAGE.m) doc.addPage();
      const x = PAGE.m + col * (size + 8);
      const y = doc.y;
      try {
        doc.image(buf, x, y, { fit: [size, size], align: 'center', valign: 'center' });
        write(doc, p.caption, x, y + size + 4, { size: 7.5, color: MUTED, width: size });
        doc.y = y;
        i++;
      } catch {
        // not an image pdfkit can read; skip it
      }
    }
  }

  const stamp = new Date(r.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    doc.page.margins.bottom = 0; // the footer sits in the margin; stop pdfkit from adding a page for it
    write(doc, `Site Diary · ${stamp} · ${p + 1}/${range.count}`, PAGE.m, PAGE.h - PAGE.m + 8, { size: 7, color: MUTED });
  }
  doc.end();
  return done;
}
