import { formatPaise, isoDate } from '@site-diary/shared';
import jwt from 'jsonwebtoken';
import { config } from '../../lib/config';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { toPdf } from '../reports/export';
import type { Report } from '../reports/report';

/** The PO as the supplier sees it: lines, rates, total, delivery site. */
export async function poPdf(companyId: string, poId: string): Promise<{ pdf: Buffer; poNo: string; supplierPhone: string | null }> {
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, companyId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
  if (!po) throw new HttpError(404, 'PO not found', 'not_found');
  if (['pending_approval', 'rejected', 'draft'].includes(po.status)) throw new HttpError(409, 'This PO is not approved yet', 'not_approved');
  const [company, supplier, project, materials] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.supplier.findUniqueOrThrow({ where: { id: po.supplierId } }),
    prisma.project.findUniqueOrThrow({ where: { id: po.projectId } }),
    prisma.material.findMany({ where: { id: { in: po.lines.map((l) => l.materialId) } } }),
  ]);
  const report: Report = {
    title: `Purchase order ${po.poNo ?? ''}`,
    company: `${company.name}${company.gstin ? ` · GSTIN ${company.gstin}` : ''}`,
    subtitle: `Date ${isoDate(po.createdAt)} · To ${supplier.name}${supplier.gstin ? ` (GSTIN ${supplier.gstin})` : ''}`,
    generatedAt: new Date().toISOString(),
    highlights: [{ label: 'Total', value: formatPaise(Number(po.totalPaise)) }],
    tables: [
      { title: 'Deliver to', columns: [{ key: 'v', header: '' }], rows: [{ v: `${project.name}${project.address ? `, ${project.address}` : ''}` }] },
      {
        title: 'Items',
        columns: [
          { key: 'material', header: 'Material', width: 3 },
          { key: 'qty', header: 'Qty', fmt: 'qty' },
          { key: 'unit', header: 'Unit' },
          { key: 'rate', header: 'Rate', fmt: 'money' },
          { key: 'amount', header: 'Amount', fmt: 'money' },
        ],
        rows: po.lines.map((l) => {
          const m = materials.find((x) => x.id === l.materialId);
          return { material: m ? `${m.nameEn} · ${m.nameGu}` : '', qty: l.qty.toNumber(), unit: m?.unit, rate: Number(l.ratePaise), amount: Math.round(l.qty.toNumber() * Number(l.ratePaise)) };
        }),
        totals: ['amount'],
      },
    ],
  };
  return { pdf: await toPdf(report), poNo: po.poNo ?? po.id.slice(0, 8), supplierPhone: supplier.phone };
}

export const poLink = (companyId: string, poId: string) =>
  `${config.publicWebUrl.replace(/\/$/, '')}/api/v1/public/po/${jwt.sign({ cid: companyId, po: poId }, config.jwtSecret, { expiresIn: '30d', audience: 'po' })}`;

export function readPoToken(token: string): { cid: string; po: string } | null {
  try {
    const c = jwt.verify(token, config.jwtSecret, { audience: 'po' }) as { cid?: string; po?: string };
    return c.cid && c.po ? { cid: c.cid, po: c.po } : null;
  } catch {
    return null;
  }
}
