import ExcelJS from 'exceljs';
import express, { Router } from 'express';
import { allow, me } from '../../lib/auth';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { param } from '../../lib/validate';
import { saveMaster } from '../masters/routes';

// W14: Excel templates for the lists a builder already keeps in Excel. Upload → preview → import.
export const imports = Router();

type Kind = 'contractor' | 'material' | 'supplier' | 'worker';
const TEMPLATES: Record<Kind, { header: string; key: string; example: string; width?: number }[]> = {
  contractor: [
    { header: 'Name', key: 'name', example: 'Bharat Construction', width: 30 },
    { header: 'Phone', key: 'phone', example: '9825012345' },
    { header: 'Trade', key: 'trade', example: 'Civil' },
    { header: 'Rate type (daily / lump_sum / per_unit)', key: 'rateType', example: 'daily', width: 34 },
  ],
  material: [
    { header: 'Name (Gujarati)', key: 'nameGu', example: 'સિમેન્ટ', width: 24 },
    { header: 'Name (English)', key: 'nameEn', example: 'Cement', width: 24 },
    { header: 'Unit (bag, ton, brass, nos, cft, sqft, kg, litre, rft, cum)', key: 'unit', example: 'bag', width: 44 },
    { header: 'Category', key: 'category', example: 'cement' },
  ],
  supplier: [
    { header: 'Name', key: 'name', example: 'Umiya Cement Traders', width: 30 },
    { header: 'Phone', key: 'phone', example: '9825012345' },
    { header: 'GSTIN', key: 'gstin', example: '24ABCDE1234F1Z5', width: 20 },
  ],
  worker: [
    { header: 'Name', key: 'name', example: 'Ramesh Vaghela', width: 26 },
    { header: 'Contractor (exact name)', key: 'contractor', example: 'Bharat Construction', width: 30 },
    { header: 'Skill (English or Gujarati name)', key: 'skill', example: 'Mason (kadiya)', width: 30 },
    { header: 'Phone', key: 'phone', example: '' },
  ],
};
const isKind = (k: string): k is Kind => k in TEMPLATES;

imports.get('/:kind/template', allow('projects', 'V'), async (req, res) => {
  const kind = param(req, 'kind');
  if (!isKind(kind)) throw new HttpError(404, 'Unknown list', 'not_found');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(kind);
  ws.columns = TEMPLATES[kind].map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  ws.addRow(Object.fromEntries(TEMPLATES[kind].map((c) => [c.key, c.example])));
  ws.getRow(1).font = { bold: true };
  res
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('content-disposition', `attachment; filename="${kind}-template.xlsx"`)
    .send(Buffer.from(await wb.xlsx.writeBuffer()));
});

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  return String(v).trim();
};

// POST /import/:kind?commit=1 with the .xlsx as the body. Without commit: checks every row and reports.
imports.post('/:kind', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const m = me(req);
  const kind = param(req, 'kind');
  if (!isKind(kind)) throw new HttpError(404, 'Unknown list', 'not_found');
  const commit = req.query.commit === '1';
  const wb = new ExcelJS.Workbook();
  try {
    const buf = req.body as Buffer;
    await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  } catch {
    throw new HttpError(400, 'Could not read this file. Use the .xlsx template.', 'bad_file');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new HttpError(400, 'The file is empty', 'empty');
  const cols = TEMPLATES[kind];
  const [contractors, skills] = await Promise.all([
    prisma.contractor.findMany({ where: { companyId: m.companyId, deletedAt: null } }),
    prisma.skill.findMany({ where: { companyId: m.companyId, deletedAt: null } }),
  ]);
  const rows: { row: number; data: Record<string, unknown>; error: string | null }[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const raw = Object.fromEntries(cols.map((c, i) => [c.key, cellText(r.getCell(i + 1).value)]));
    if (Object.values(raw).every((v) => !v)) return;
    let data: Record<string, unknown> = { ...raw };
    let error: string | null = null;
    if (kind === 'worker') {
      const contractor = contractors.find((c) => c.name.toLowerCase() === String(raw.contractor).toLowerCase());
      const skill = skills.find((s) => [s.nameEn.toLowerCase(), s.nameGu].includes(String(raw.skill).toLowerCase()) || s.nameGu === raw.skill);
      if (!contractor) error = `Contractor "${String(raw.contractor)}" not found`;
      data = { name: raw.name, phone: raw.phone, contractorId: contractor?.id, skillId: skill?.id ?? null };
    }
    if (kind === 'contractor' && !raw.rateType) data.rateType = 'daily';
    rows.push({ row: n, data, error });
  });

  let imported = 0;
  for (const r of rows) {
    if (r.error) continue;
    try {
      if (commit) {
        await saveMaster(m, req.ip ?? null, kind, r.data);
        imported++;
      } else {
        const { masterSchemas } = await import('@site-diary/shared');
        masterSchemas[kind].parse(r.data);
      }
    } catch (e) {
      r.error = e instanceof HttpError ? e.message : e instanceof Error && 'issues' in e ? (e as { issues: { path: string[]; message: string }[] }).issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : String(e);
    }
  }
  res.json({ total: rows.length, ok: rows.filter((r) => !r.error).length, imported, rows });
});
