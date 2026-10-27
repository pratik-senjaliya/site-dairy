import { noticeText, t as tr, type Locale, type Notice } from '@site-diary/i18n';
import {
  acceptedQty, addDays, bookTotals, can, unitAccount, type BookLine, companySettingsSchema, masterSchemas, WORK_ITEM_TEMPLATES, type CompanySettings, type MasterKind, isLowStock, isoDate, PULL_TABLES, PUSH_ORDER, roundQty, settlePeriod, shortDate, stockDelta, type PullResponse, type PushResult, type Role, type StockRow,
} from '@site-diary/shared';
import { randomUUID } from 'expo-crypto';
import { kv } from '../lib/kv';
import { DEMO_USERS, seedDemo, type DemoRow, type Tables } from './seed';

// A small stand-in for the API, inside the app, for trying Site Diary with no server or internet.
// It answers the same paths with the same shapes; data lives on this phone. Each role keeps its own
// phone copy (as on real phones) and they meet here, so the owner sees what the supervisor entered.

interface State { rev: number; t: Tables; approvals: DemoRow[]; notices: DemoRow[]; companyId: string; company?: { name: string; settings: CompanySettings } }

const KEY = 'demo:server:v4'; // v4: a partner, flats and the money book
let state: State | null = null;

class DemoError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}
export { DemoError };

async function load(): Promise<State> {
  if (state) return state;
  const saved = await kv.getJson<State>(KEY);
  if (saved && saved.t.project?.[0]) state = saved;
  else {
    const s = seedDemo();
    state = { rev: 1, t: s.t, approvals: s.approvals, notices: [], companyId: s.companyId };
  }
  return state;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void (state && kv.setJson(KEY, state)), 200);
};

export async function resetDemo() {
  state = null;
  await kv.remove(KEY);
}

const rows = (s: State, table: string) => (s.t[table] ??= []);
const live = (s: State, table: string) => rows(s, table).filter((r) => !r.deletedAt);
const find = (s: State, table: string, id: unknown) => rows(s, table).find((r) => r.id === id);
// As on the real server, the person comes from the sign-in token ("demo:<user id>").
let current: string | null = null;
const company = (s: State) => s.company ?? { name: 'Shree Ganesh Builders', settings: companySettingsSchema.parse({}) };
const me = (s: State) => {
  const u = find(s, 'user', current?.startsWith('demo:') ? current.slice(5) : null);
  if (!u) throw new DemoError(401, 'Please sign in', 'unauthenticated');
  return u;
};
const lang = (s: State): Locale => (me(s).language as Locale) ?? 'gu';

function notify(s: State, userIds: unknown[], kind: string, title: string, body?: string) {
  const at = new Date().toISOString();
  for (const userId of new Set(userIds)) s.notices.unshift({ id: randomUUID(), userId, kind, title, body: body ?? null, entityType: null, entityId: null, readAt: null, createdAt: at });
}
const idsOf = (s: State, roles: string[]) => live(s, 'user').filter((u) => roles.includes(String(u.role))).map((u) => u.id);
const userLang = (s: State, id: unknown): Locale => (find(s, 'user', id)?.language as Locale) ?? 'gu';

function stock(s: State): StockRow[] {
  const m = new Map<string, number>();
  const add = (projectId: unknown, materialId: unknown, d: number) => m.set(`${String(projectId)}|${String(materialId)}`, (m.get(`${String(projectId)}|${String(materialId)}`) ?? 0) + d);
  for (const g of live(s, 'grn')) for (const l of live(s, 'grnLine').filter((x) => x.grnId === g.id)) add(g.projectId, l.materialId, stockDelta('grn', acceptedQty(Number(l.qty), Number(l.rejectedQty ?? 0))));
  for (const i of live(s, 'materialIssue')) add(i.projectId, i.materialId, stockDelta('issue', Number(i.qty)));
  for (const x of live(s, 'stockTransfer')) {
    if (x.status === 'cancelled') continue;
    add(x.fromProjectId, x.materialId, stockDelta('transfer_out', Number(x.qty)));
    if (x.status === 'received') add(x.toProjectId, x.materialId, stockDelta('transfer_in', Number(x.qty)));
  }
  return [...m].map(([k, qty]) => ({ projectId: k.split('|')[0]!, materialId: k.split('|')[1]!, qty: roundQty(qty) }));
}

/** One contractor's wages at a site, as the API's previewWages: attendance × rate in force − unsettled advances. */
function account(s: State, projectId: string, contractorId: unknown, from: string, to: string) {
  const days = live(s, 'attendanceEntry').filter((a) => a.projectId === projectId && a.contractorId === contractorId && String(a.date) >= from && String(a.date) <= to)
    .map((a) => ({ date: String(a.date), skillId: String(a.skillId), count: Number(a.count), halfDayCount: Number(a.halfDayCount), otHours: Number(a.otHours) }));
  const rates = live(s, 'contractorRate').filter((r) => r.contractorId === contractorId).map((r) => ({ skillId: String(r.skillId), dailyRatePaise: Number(r.dailyRatePaise), effectiveFrom: String(r.effectiveFrom) }));
  const open = live(s, 'advance').filter((a) => a.projectId === projectId && a.contractorId === contractorId && !a.settlementId && String(a.date) <= to);
  const result = settlePeriod(days, rates, open.reduce((x, a) => x + Number(a.amountPaise), 0));
  const bySkill = [...new Set(days.map((d) => d.skillId))].map((skillId) => {
    const mine = days.filter((d) => d.skillId === skillId);
    return { skillId, manDays: settlePeriod(mine, rates, 0).manDays, otHours: mine.reduce((x, d) => x + d.otHours, 0), gross: settlePeriod(mine, rates, 0).gross };
  });
  const perDay = new Map<string, number>();
  for (const d of days) perDay.set(d.date, (perDay.get(d.date) ?? 0) + d.count + d.halfDayCount / 2);
  return { ...result, bySkill, days: [...perDay].sort().map(([date, manDays]) => ({ date, manDays })), advanceIds: open.map((a) => a.id) };
}

/** Last settled day for a contractor at a site (any settlement not rejected). */
const settledTill = (s: State, projectId: string, contractorId: unknown) =>
  live(s, 'wageSettlement').filter((w) => w.projectId === projectId && w.contractorId === contractorId && w.status !== 'rejected').map((w) => String(w.periodTo)).sort().at(-1) ?? null;

function summary(s: State, projectId: string, date: string) {
  const project = find(s, 'project', projectId)!;
  const day = live(s, 'siteDay').find((d) => d.projectId === projectId && d.date === date);
  const att = live(s, 'attendanceEntry').filter((a) => a.projectId === projectId);
  const workersOn = (d: string) => att.filter((a) => a.date === d).reduce((x, a) => x + Number(a.count) + Number(a.halfDayCount), 0);
  const todays = att.filter((a) => a.date === date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, -(i + 1))).map(workersOn).filter((n) => n > 0);
  const avg7 = week.length ? Math.round(week.reduce((a, b) => a + b, 0) / week.length) : 0;
  const workers = workersOn(date);
  const mat = (id: unknown) => find(s, 'material', id);
  const node = (id: unknown) => {
    const n = find(s, 'structureNode', id);
    const p = n ? find(s, 'structureNode', n.parentId) : undefined;
    return n ? (p ? `${String(p.name)} · ${String(n.name)}` : String(n.name)) : null;
  };
  const grns = live(s, 'grn').filter((g) => g.projectId === projectId && g.date === date);
  const st = stock(s);
  const low = live(s, 'siteMaterialSetting').filter((x) => x.projectId === projectId).map((x) => {
    const m = mat(x.materialId);
    const qty = st.find((y) => y.projectId === projectId && y.materialId === x.materialId)?.qty ?? 0;
    return { material: String(m?.nameEn ?? ''), materialGu: String(m?.nameGu ?? ''), unit: String(m?.unit ?? ''), qty, min: Number(x.minStock) };
  }).filter((r) => isLowStock(r.qty, r.min));
  const progress = live(s, 'dailyProgress').filter((p) => p.projectId === projectId && p.date === date);
  const photos = live(s, 'photo').filter((p) => p.projectId === projectId && String(p.takenAt).slice(0, 10) === date);
  const marker = String(day?.marker ?? 'work');
  const missing = marker === 'work' ? [...(todays.length ? [] : ['attendance']), ...(progress.length ? [] : ['progress'])] : [];
  const changePct = avg7 && todays.length ? Math.round(((workers - avg7) / avg7) * 100) : null; // nothing entered yet is not a 100% drop
  const alerts: Notice[] = [
    ...(changePct !== null && Math.abs(changePct) >= 20 && todays.length ? [{ key: changePct > 0 ? 'alert.labourUp' : 'alert.labourDown', vars: { pct: Math.abs(changePct), avg: avg7 } } as const] : []),
    ...low.map((l) => ({ key: 'alert.lowStock', vars: { material: l.material, qty: l.qty, unit: l.unit, min: l.min }, gu: { material: l.materialGu } }) as const),
  ];
  const contractors = live(s, 'contractor');
  const cost = contractors.map((c) => account(s, projectId, c.id, date, date)).reduce((a, r) => ({ gross: a.gross + r.gross, missing: a.missing || r.missingRates.length > 0 }), { gross: 0, missing: false });
  return {
    project: { id: projectId, name: String(project.name) }, date, marker, note: (day?.note as string | null) ?? null,
    labour: {
      workers, manDays: todays.reduce((x, a) => x + Number(a.count) + Number(a.halfDayCount) / 2, 0), costPaise: cost.gross, costMissingRates: cost.missing, yesterday: workersOn(addDays(date, -1)), avg7, changePct,
      byContractor: contractors.map((c) => ({ contractor: String(c.name), workers: todays.filter((a) => a.contractorId === c.id).reduce((x, a) => x + Number(a.count) + Number(a.halfDayCount), 0) })).filter((c) => c.workers),
    },
    materialIn: grns.flatMap((g) => live(s, 'grnLine').filter((l) => l.grnId === g.id).map((l) => ({
      material: String(mat(l.materialId)?.nameEn ?? ''), materialGu: String(mat(l.materialId)?.nameGu ?? ''), unit: String(mat(l.materialId)?.unit ?? ''), qty: Number(l.qty), rejected: Number(l.rejectedQty ?? 0),
      supplier: (find(s, 'supplier', g.supplierId)?.name as string | undefined) ?? null, challanNo: (g.challanNo as string | null) ?? null,
    }))),
    materialUsed: live(s, 'materialIssue').filter((i) => i.projectId === projectId && i.date === date).map((i) => ({
      material: String(mat(i.materialId)?.nameEn ?? ''), materialGu: String(mat(i.materialId)?.nameGu ?? ''), unit: String(mat(i.materialId)?.unit ?? ''), qty: Number(i.qty),
      workItem: (find(s, 'workItem', i.workItemId)?.nameEn as string | undefined) ?? null, floor: node(i.structureNodeId),
    })),
    progress: progress.map((p) => ({ workItem: String(find(s, 'workItem', p.workItemId)?.nameEn ?? ''), workItemGu: String(find(s, 'workItem', p.workItemId)?.nameGu ?? ''), floor: node(p.structureNodeId), percent: Number(p.percent), note: (p.note as string | null) ?? null })),
    photos: photos.map((p) => ({ id: p.id, sourceType: p.sourceType, uploaded: true })),
    issuesOpened: [], openIssues: live(s, 'issue').filter((i) => i.projectId === projectId && i.status === 'open').length,
    lowStock: low, missing, alerts,
  };
}

function approvalView(s: State, a: DemoRow) {
  const lines = live(s, 'indentLine').filter((l) => l.indentId === a.entityId).map((l) => ({ material: find(s, 'material', l.materialId), qty: Number(l.qty) }));
  const indent = find(s, 'indent', a.entityId);
  const p = (a.proposal ?? {}) as Record<string, unknown>;
  return {
    ...a, requestedBy: find(s, 'user', a.requestedById)?.name ?? null, project: find(s, 'project', a.projectId)?.name ?? null,
    details: a.entityType === 'indent' ? { lines, neededBy: indent?.neededBy, note: indent?.note }
      : a.entityType === 'wageSettlement' ? (() => {
        const w = find(s, 'wageSettlement', a.entityId);
        return { contractor: find(s, 'contractor', w?.contractorId)?.name, periodFrom: w?.periodFrom, periodTo: w?.periodTo, grossPaise: w?.grossPaise, advancesPaise: w?.advancesPaise, netPaise: w?.netPaise };
      })()
      : { current: find(s, 'attendanceEntry', a.entityId) ?? null, proposed: p, contractor: find(s, 'contractor', p.contractorId)?.name, skill: find(s, 'skill', p.skillId)?.nameGu },
  };
}

function push(s: State, changes: Record<string, DemoRow[]>): PushResult {
  const u = me(s);
  const result: PushResult = { applied: 0, remapped: {}, pending: [], rejected: [] };
  const today = isoDate();
  const touchedLow = new Set<string>();
  for (const table of PUSH_ORDER) {
    for (const raw of changes[table] ?? []) {
      const row = { ...raw } as DemoRow;
      if (table === 'attendanceEntry') {
        const late = String(row.date) < today && row.recordedOn !== row.date;
        if (late && u.role === 'supervisor') {
          s.approvals.unshift({ id: randomUUID(), projectId: row.projectId, entityType: 'attendanceEntry', entityId: row.id, requestedById: u.id, status: 'pending', proposal: row, createdAt: new Date().toISOString() });
          notify(s, idsOf(s, ['owner', 'engineer']), 'approval_needed', tr(userLang(s, idsOf(s, ['owner'])[0]), 'notify.approvalNeeded', { what: tr('gu', 'approval.attendanceEntry') }));
          result.pending.push(row.id);
          continue;
        }
        delete row.recordedOn;
      }
      const list = rows(s, table);
      const i = list.findIndex((r) => r.id === row.id);
      const now = new Date().toISOString();
      const saved = { ...(i >= 0 ? list[i] : { companyId: s.companyId, createdAt: now, createdById: u.id }), ...row, updatedAt: now, serverRev: ++s.rev, ...(table === 'photo' && { uploaded: true }) } as DemoRow;
      if (i >= 0) list[i] = saved;
      else list.push(saved);
      result.applied++;
      if (table === 'indent' && row.status === 'submitted' && can(u.role as Role, 'indent', 'A')) {
        saved.status = 'approved'; // an approver's own request needs no one else
      } else if (table === 'indent' && row.status === 'submitted' && !s.approvals.some((a) => a.entityId === row.id)) {
        s.approvals.unshift({ id: randomUUID(), projectId: row.projectId, entityType: 'indent', entityId: row.id, requestedById: u.id, status: 'pending', proposal: null, createdAt: now });
        for (const id of idsOf(s, ['owner', 'engineer'])) notify(s, [id], 'approval_needed', tr(userLang(s, id), 'notify.approvalNeeded', { what: tr(userLang(s, id), 'approval.indent') }), tr(userLang(s, id), 'notify.from', { name: String(u.name) }));
      }
      if (table === 'grnLine' || table === 'materialIssue') touchedLow.add(String(table === 'grnLine' ? find(s, 'grn', row.grnId)?.projectId : row.projectId));
    }
  }
  for (const projectId of touchedLow) {
    for (const l of summary(s, projectId, today).lowStock) {
      for (const id of idsOf(s, ['owner', 'engineer', 'store'])) {
        const lg = userLang(s, id);
        notify(s, [id], 'low_stock', tr(lg, 'notify.lowStock', { material: lg === 'en' ? l.material : l.materialGu, site: String(find(s, 'project', projectId)?.name) }), tr(lg, 'notify.lowStockBody', { qty: l.qty, unit: l.unit, min: l.min }));
      }
    }
  }
  return result;
}

export async function demoApi(method: string, path: string, body: unknown, token: string | null): Promise<unknown> {
  const s = await load();
  current = token;
  const url = new URL(path, 'http://demo');
  const p = url.pathname;
  const q = (k: string) => url.searchParams.get(k);
  const b = (body ?? {}) as Record<string, unknown>;
  const today = isoDate();
  const out = (v: unknown) => (save(), v);

  if (p === '/auth/otp/request') return { sent: true };
  if (p === '/auth/otp/verify' || p === '/auth/demo') {
    const digits = String(b.phone ?? '').replace(/\D/g, '').slice(-10);
    const u = live(s, 'user').find((x) => (b.role ? x.role === b.role : digits.length === 10 && String(x.phone).endsWith(digits)));
    if (!u) throw new DemoError(403, 'Demo: use 98000 00001 (owner), …02 engineer, …03 supervisor, …04 store, …05 accountant, …06 partner', 'no_account');
    return out({ accessToken: `demo:${u.id}`, refreshToken: `demo:${u.id}`, user: { id: u.id, name: u.name, role: u.role, companyId: s.companyId } });
  }
  if (p === '/auth/logout') return out({ ok: true });
  if (p === '/auth/push-token') return { ok: true };
  if (p === '/auth/me' && method === 'PATCH') {
    Object.assign(me(s), { language: b.language ?? me(s).language });
    return out({ ok: true });
  }
  const u = me(s);
  if (p === '/auth/me') {
    return {
      user: { id: u.id, name: u.name, phone: u.phone, role: u.role, language: u.language },
      company: { id: s.companyId, name: company(s).name, plan: 'pilot', settings: company(s).settings, planStatus: { label: 'Pilot', endsOn: addDays(today, 45), daysLeft: 45 } },
      projects: live(s, 'project').map((x) => ({ id: x.id, name: x.name, status: x.status })),
    };
  }
  if (p === '/sync/pull') {
    const since = Number(q('since') ?? 0);
    const changes: Record<string, DemoRow[]> = {};
    for (const table of PULL_TABLES) {
      const list = rows(s, table);
      const fresh = list.filter((r) => Number(r.serverRev) > since && (since > 0 || !r.deletedAt));
      if (fresh.length) changes[table] = fresh;
    }
    const res: PullResponse = { rev: String(s.rev), changes, stock: stock(s), today, sites: live(s, 'project').map((x) => x.id) };
    return res;
  }
  if (p === '/sync/push') return out(push(s, (b.changes ?? {}) as Record<string, DemoRow[]>));
  // Labour cost comes from contractor rates, which only roles that see wages may read.
  const costFor = <T extends { labour: { costPaise: number; costMissingRates: boolean } }>(x: T): T => (can(u.role as Role, 'wages', 'V') ? x : { ...x, labour: { ...x.labour, costPaise: 0, costMissingRates: false } });
  if (p === '/dashboard') {
    const date = q('date') ?? today;
    const sites = live(s, 'project').map((x) => costFor(summary(s, x.id, date)));
    return {
      date,
      totals: {
        workers: sites.reduce((a, x) => a + x.labour.workers, 0), yesterday: sites.reduce((a, x) => a + x.labour.yesterday, 0), labourCostPaise: sites.reduce((a, x) => a + x.labour.costPaise, 0),
        grnLines: sites.reduce((a, x) => a + x.materialIn.length, 0), issues: sites.reduce((a, x) => a + x.materialUsed.length, 0), photos: sites.reduce((a, x) => a + x.photos.length, 0),
        sitesMissingEntry: sites.filter((x) => x.missing.includes('attendance')).length, pendingApprovals: s.approvals.filter((a) => a.status === 'pending').length,
      },
      // The demo's one site has everyone on it.
      sites: sites.map((x) => ({ ...x, team: ['supervisor', 'engineer', 'store'].flatMap((role) => live(s, 'user').filter((m) => m.role === role).map((m) => ({ id: m.id, name: m.name, role, phone: m.phone }))) })),
    };
  }
  if (p.startsWith('/dashboard/site/')) {
    const id = p.split('/').pop()!;
    const date = q('date') ?? today;
    const trend = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)).map((d) => ({ date: d, workers: live(s, 'attendanceEntry').filter((a) => a.projectId === id && a.date === d).reduce((x, a) => x + Number(a.count) + Number(a.halfDayCount), 0) }));
    return { ...costFor(summary(s, id, date)), trend };
  }
  if (p === '/wages/summary') {
    if (!can(u.role as Role, 'wages', 'V')) throw new DemoError(403, 'You do not have permission to do this', 'forbidden');
    const projectId = String(q('projectId'));
    const from = String(q('from'));
    const to = String(q('to'));
    const ids = new Set([
      ...live(s, 'attendanceEntry').filter((a) => a.projectId === projectId && String(a.date) >= from && String(a.date) <= to).map((a) => a.contractorId),
      ...live(s, 'advance').filter((a) => a.projectId === projectId && !a.settlementId && String(a.date) <= to).map((a) => a.contractorId),
    ]);
    const list = live(s, 'contractor').filter((c) => ids.has(c.id)).map((c) => {
      const till = settledTill(s, projectId, c.id);
      const start = till && till >= from ? addDays(till, 1) : from;
      const { advanceIds: _ids, ...money } = account(s, projectId, c.id, start, to);
      return { contractor: { id: c.id, name: String(c.name), phone: (c.phone as string | null) ?? null }, from: start, ...money, settledTill: till };
    });
    const sum = (k: 'manDays' | 'gross' | 'advances' | 'net') => list.reduce((x, r) => x + r[k], 0);
    return { projectId, from, to, contractors: list, total: { manDays: sum('manDays'), gross: sum('gross'), advances: sum('advances'), net: sum('net') } };
  }
  if (p === '/wages' && method === 'GET') return live(s, 'wageSettlement').filter((w) => w.projectId === q('projectId')).sort((a, b) => String(b.periodTo).localeCompare(String(a.periodTo)));
  if (p === '/wages' && method === 'POST') {
    if (!['owner', 'engineer', 'accountant'].includes(String(u.role))) throw new DemoError(403, 'You do not have permission to do this', 'forbidden');
    const [projectId, contractorId, from, to] = [String(b.projectId), String(b.contractorId), String(b.from), String(b.to)];
    if (live(s, 'wageSettlement').some((w) => w.projectId === projectId && w.contractorId === contractorId && w.status !== 'rejected' && String(w.periodFrom) <= to && String(w.periodTo) >= from)) throw new DemoError(409, 'These days are already in another settlement', 'overlap');
    const a = account(s, projectId, contractorId, from, to);
    if (a.missingRates.length) throw new DemoError(400, 'Some skills have no rate for this contractor. Add rates first.', 'missing_rates');
    if (!a.manDays) throw new DemoError(400, 'No attendance in this period', 'empty');
    const owner = u.role === 'owner';
    const w: DemoRow = { id: randomUUID(), companyId: s.companyId, projectId, contractorId, periodFrom: from, periodTo: to, grossPaise: a.gross, advancesPaise: a.advances, netPaise: a.net, status: owner ? 'approved' : 'submitted', createdById: u.id, createdAt: new Date().toISOString() };
    rows(s, 'wageSettlement').push(w);
    for (const id of a.advanceIds) Object.assign(find(s, 'advance', id) ?? {}, { settlementId: w.id, serverRev: ++s.rev });
    if (!owner) {
      s.approvals.unshift({ id: randomUUID(), projectId, entityType: 'wageSettlement', entityId: w.id, requestedById: u.id, status: 'pending', proposal: null, createdAt: w.createdAt });
      for (const id of idsOf(s, ['owner'])) notify(s, [id], 'approval_needed', tr(userLang(s, id), 'notify.approvalNeeded', { what: tr(userLang(s, id), 'approval.wageSettlement') }), tr(userLang(s, id), 'notify.from', { name: String(u.name) }));
    }
    return out(w);
  }
  const payMatch = p.match(/^\/wages\/([^/]+)\/pay$/);
  if (payMatch) {
    const w = find(s, 'wageSettlement', payMatch[1]);
    if (!w) throw new DemoError(404, 'Not found', 'not_found');
    if (w.status !== 'approved') throw new DemoError(409, 'Only an approved settlement can be paid', 'not_approved');
    Object.assign(w, { status: 'paid', paidAt: new Date().toISOString(), paidMode: b.mode });
    return out(w);
  }
  if (p === '/approvals/count') return { count: ['owner', 'engineer'].includes(String(u.role)) ? s.approvals.filter((a) => a.status === 'pending').length : 0 };
  if (p === '/approvals' && method === 'GET') {
    const status = q('status');
    return s.approvals.filter((a) => !status || a.status === status).map((a) => approvalView(s, a));
  }
  const decideMatch = p.match(/^\/approvals\/([^/]+)\/decide$/);
  if (decideMatch) {
    const a = s.approvals.find((x) => x.id === decideMatch[1]);
    if (!a || a.status !== 'pending') throw new DemoError(409, 'Already decided', 'decided');
    const approved = b.decision === 'approve';
    if (!approved && !b.reason) throw new DemoError(400, 'Please give a reason for rejecting', 'reason_needed');
    Object.assign(a, { status: approved ? 'approved' : 'rejected', decidedById: u.id, decidedAt: new Date().toISOString(), reason: b.reason ?? null });
    if (a.entityType === 'indent') {
      const i = find(s, 'indent', a.entityId);
      if (i) Object.assign(i, { status: approved ? 'approved' : 'rejected', serverRev: ++s.rev });
    } else if (a.entityType === 'wageSettlement') {
      Object.assign(find(s, 'wageSettlement', a.entityId) ?? {}, { status: approved ? 'approved' : 'rejected', approvedById: u.id });
      if (!approved) for (const x of live(s, 'advance').filter((x) => x.settlementId === a.entityId)) Object.assign(x, { settlementId: null, serverRev: ++s.rev });
    } else if (approved) {
      const row = { ...(a.proposal as DemoRow) };
      delete row.recordedOn;
      const list = rows(s, 'attendanceEntry');
      const at = list.findIndex((r) => r.id === row.id);
      const saved = { companyId: s.companyId, ...(at >= 0 ? list[at] : {}), ...row, serverRev: ++s.rev } as DemoRow;
      if (at >= 0) list[at] = saved;
      else list.push(saved);
    }
    const lg = userLang(s, a.requestedById);
    notify(s, [a.requestedById], approved ? 'approved' : 'rejected', tr(lg, approved ? 'notify.approved' : 'notify.rejected', { what: tr(lg, `approval.${String(a.entityType)}` as 'approval.indent') }), b.reason ? `${String(u.name)}: ${String(b.reason)}` : tr(lg, 'notify.by', { name: String(u.name) }));
    return out(a);
  }
  if (p === '/notifications' && method === 'GET') {
    const items = s.notices.filter((n) => n.userId === u.id).slice(0, 50);
    if (!items.length && (u.role === 'owner' || u.role === 'engineer')) {
      notify(s, [u.id], 'nightly_report', tr(lang(s), 'notify.nightly', { date: shortDate(addDays(today, -1)) }), 'Shivam Heights');
      save();
    }
    const mine = s.notices.filter((n) => n.userId === u.id).slice(0, 50);
    return { items: mine, unread: mine.filter((n) => !n.readAt).length };
  }
  if (p === '/notifications/read') {
    for (const n of s.notices) if (n.userId === u.id && !n.readAt) n.readAt = new Date().toISOString();
    return out({ ok: true });
  }
  if (p === '/reports/nightly/history') return [];
  if (p === '/reports/nightly/run') return { id: null, link: null };
  if (p === '/company' && method === 'GET') return { ...company(s), gstin: null, planStatus: { label: 'Pilot', daysLeft: 45 } };
  if (p === '/company' && method === 'PATCH') {
    s.company = { name: String(b.name), settings: companySettingsSchema.parse(b.settings ?? {}) };
    return out(company(s));
  }
  // Setup from the phone: sites, floors, people and the master lists, the same shapes as the API.
  const bump = (table: string, row: DemoRow) => {
    const list = rows(s, table);
    const i = list.findIndex((r) => r.id === row.id);
    const saved = { companyId: s.companyId, createdAt: new Date().toISOString(), ...(i >= 0 ? list[i] : {}), ...row, updatedAt: new Date().toISOString(), serverRev: ++s.rev } as DemoRow;
    if (i >= 0) list[i] = saved;
    else list.push(saved);
    return saved;
  };
  const siteIdsOf = (x: DemoRow) => (Array.isArray(x.siteIds) ? (x.siteIds as string[]) : live(s, 'project').map((y) => y.id));
  if (p === '/users' && method === 'GET') return live(s, 'user').map((x) => ({ ...x, siteIds: siteIdsOf(x), lastSeenAt: null }));
  const userMatch = p.match(/^\/users(?:\/([^/]+))?$/);
  if (userMatch && (method === 'POST' || method === 'PATCH')) {
    const phone = `+91${String(b.phone).replace(/\D/g, '').slice(-10)}`;
    if (method === 'POST' && live(s, 'user').some((x) => x.phone === phone)) throw new DemoError(409, 'This phone number already has a login', 'duplicate');
    return out(bump('user', { id: userMatch[1] ?? randomUUID(), name: b.name, phone, role: b.role, language: b.language ?? 'gu', isActive: b.isActive ?? true, siteIds: b.siteIds ?? [] }));
  }
  if (p === '/projects' && method === 'POST') {
    const project = bump('project', { id: randomUUID(), name: b.name, address: b.address ?? null, type: b.type, status: b.status ?? 'active' });
    WORK_ITEM_TEMPLATES[b.type as keyof typeof WORK_ITEM_TEMPLATES].forEach(([gu, en], sort) => bump('workItem', { id: randomUUID(), projectId: project.id, nameGu: gu, nameEn: en, sort }));
    return out(project);
  }
  const bulkMatch = p.match(/^\/projects\/([^/]+)\/structure\/bulk$/);
  if (bulkMatch) {
    const projectId = bulkMatch[1];
    const tower = bump('structureNode', { id: randomUUID(), projectId, parentId: null, kind: 'tower', name: b.towerName, sort: live(s, 'structureNode').filter((n) => n.projectId === projectId && n.kind === 'tower').length });
    const names = [...Array.from({ length: Number(b.basements ?? 0) }, (_, i) => `Basement ${Number(b.basements) - i}`), ...(b.ground === false ? [] : ['Ground']), ...Array.from({ length: Number(b.floors) }, (_, i) => `Floor ${i + 1}`)];
    names.forEach((name, sort) => bump('structureNode', { id: randomUUID(), projectId, parentId: tower.id, kind: 'floor', name, sort }));
    return out({ tower, floors: names.length });
  }
  const projectMatch = p.match(/^\/projects\/([^/]+)$/);
  if (projectMatch && method === 'PATCH') return out(bump('project', { id: projectMatch[1]!, name: b.name, address: b.address ?? null, type: b.type, status: b.status }));
  if (projectMatch) {
    const id = projectMatch[1];
    return {
      ...find(s, 'project', id),
      structure: live(s, 'structureNode').filter((n) => n.projectId === id).sort((x, y) => Number(x.sort) - Number(y.sort)),
      workItems: live(s, 'workItem').filter((w) => w.projectId === id),
      team: live(s, 'user').filter((x) => ['engineer', 'supervisor', 'store'].includes(String(x.role)) && siteIdsOf(x).includes(String(id))).map((x) => ({ id: x.id, name: x.name, role: x.role, phone: x.phone })),
    };
  }
  const masterMatch = p.match(/^\/masters\/([^/]+)(?:\/([^/]+))?$/);
  if (masterMatch && masterMatch[1]! in masterSchemas) {
    const kind = masterMatch[1] as MasterKind;
    if (method === 'GET') {
      return live(s, kind).filter((r) => !q('contractorId') || r.contractorId === q('contractorId')).sort((x, y) => String(y.effectiveFrom ?? '').localeCompare(String(x.effectiveFrom ?? '')));
    }
    if (method === 'DELETE') return out(bump(kind, { id: masterMatch[2]!, deletedAt: new Date().toISOString() }));
    const data = masterSchemas[kind].parse(b) as Record<string, unknown>;
    return out(bump(kind, { id: masterMatch[2] ?? randomUUID(), ...data }));
  }
  if (p === '/purchase/pos' && method === 'POST') {
    const lines = (b.lines ?? []) as { materialId: string; qty: number; ratePaise: number }[];
    const po = bump('purchaseOrder', {
      id: randomUUID(), projectId: b.projectId, supplierId: b.supplierId, indentId: b.indentId ?? null, poNo: `PO-DEMO-${String(live(s, 'purchaseOrder').length + 1).padStart(3, '0')}`,
      status: 'approved', totalPaise: lines.reduce((x, l) => x + Math.round(l.qty * l.ratePaise), 0),
    });
    for (const l of lines) bump('poLine', { id: randomUUID(), poId: po.id, materialId: l.materialId, qty: l.qty, ratePaise: l.ratePaise });
    const indent = find(s, 'indent', b.indentId);
    if (indent && indent.status === 'approved') bump('indent', { ...indent, status: 'ordered' });
    return out(po);
  }
  const poMatch = p.match(/^\/purchase\/pos\/([^/]+)\/(share|status)$/);
  if (poMatch?.[2] === 'share') return { link: '', whatsapp: '' };
  if (poMatch?.[2] === 'status') return out(bump('purchaseOrder', { ...find(s, 'purchaseOrder', poMatch[1]), id: poMatch[1]!, status: b.status }));
  const ledgerMatch = p.match(/^\/purchase\/supplier-ledger\/([^/]+)$/);
  if (ledgerMatch) {
    const supplierId = ledgerMatch[1];
    const entries = [
      ...live(s, 'grn').filter((g) => g.supplierId === supplierId).map((g) => {
        let unpricedLines = 0;
        const debitPaise = live(s, 'grnLine').filter((l) => l.grnId === g.id).reduce((x, l) => {
          const rate = l.ratePaise ?? live(s, 'poLine').find((pl) => pl.poId === g.poId && pl.materialId === l.materialId)?.ratePaise ?? null;
          if (rate == null) unpricedLines++;
          return x + Math.round((Number(l.qty) - Number(l.rejectedQty ?? 0)) * Number(rate ?? 0));
        }, 0);
        const items = live(s, 'grnLine').filter((l) => l.grnId === g.id).map((l) => ({ materialId: String(l.materialId), qty: Number(l.qty) - Number(l.rejectedQty ?? 0), ratePaise: l.ratePaise == null ? null : Number(l.ratePaise) }));
        return { date: `${String(g.date)}T00:00:00.000Z`, kind: 'grn' as const, id: g.id, ref: (g.challanNo as string | null) ?? null, projectId: g.projectId, debitPaise, creditPaise: 0, unpricedLines, items, mode: null };
      }),
      ...live(s, 'supplierPayment').filter((x) => x.supplierId === supplierId).map((x) => ({ date: `${String(x.date)}T00:00:00.000Z`, kind: 'payment' as const, id: x.id, ref: (x.reference as string | null) ?? null, projectId: (x.projectId as string | null) ?? null, debitPaise: 0, creditPaise: Number(x.amountPaise), unpricedLines: 0, items: [], mode: x.mode })),
    ].sort((x, y) => x.date.localeCompare(y.date));
    let balance = 0;
    const list = entries.map((e) => ({ ...e, balancePaise: (balance += e.debitPaise - e.creditPaise) }));
    return { rows: list, duePaise: balance };
  }
  if (p === '/purchase/supplier-payments') return out(bump('supplierPayment', { id: randomUUID(), supplierId: b.supplierId, projectId: b.projectId ?? null, amountPaise: b.amountPaise, date: b.date, mode: b.mode, reference: b.reference ?? null, createdById: u.id }));
  if (p === '/purchase/by-material') {
    const by = new Map<string, { materialId: string; supplierId: string; qty: number; amountPaise: number; receipts: number; unpriced: number }>();
    for (const g of live(s, 'grn').filter((x) => x.supplierId)) {
      for (const l of live(s, 'grnLine').filter((x) => x.grnId === g.id)) {
        const key = `${String(l.materialId)}:${String(g.supplierId)}`;
        const r = by.get(key) ?? { materialId: String(l.materialId), supplierId: String(g.supplierId), qty: 0, amountPaise: 0, receipts: 0, unpriced: 0 };
        const qty = Number(l.qty) - Number(l.rejectedQty ?? 0);
        r.qty += qty;
        r.amountPaise += Math.round(qty * Number(l.ratePaise ?? 0));
        r.receipts += 1;
        if (l.ratePaise == null) r.unpriced += 1;
        by.set(key, r);
      }
    }
    return [...by.values()];
  }
  // The partners' book, as the API's accounts module: entries, plus supplier payments and upad made elsewhere.
  if (p.startsWith('/accounts')) {
    if (!can(u.role as Role, 'accounts', method === 'GET' ? 'V' : 'C')) throw new DemoError(403, 'You do not have permission to do this', 'forbidden');
    const name = (id: unknown) => (find(s, 'user', id)?.name as string | undefined) ?? null;
    const entryMatch = p.match(/^\/accounts\/entries\/([^/]+)$/);
    if (entryMatch && method === 'DELETE') {
      const e = find(s, 'moneyEntry', entryMatch[1]);
      if (!e || e.deletedAt) throw new DemoError(404, 'Not found', 'not_found');
      if (e.createdById !== u.id && u.role !== 'owner') throw new DemoError(403, 'Only the person who wrote it or the owner can remove it', 'forbidden');
      return out(bump('moneyEntry', { ...e, deletedAt: new Date().toISOString(), deletedById: u.id }));
    }
    if (p === '/accounts/entries') {
      const unit = b.unitId ? find(s, 'unit', b.unitId) : null;
      return out(bump('moneyEntry', { id: (b.id as string | undefined) ?? randomUUID(), projectId: unit?.projectId ?? b.projectId ?? null, direction: b.direction, kind: b.kind, unitId: b.unitId ?? null, party: b.party ?? null, amountPaise: b.amountPaise, date: b.date, mode: b.mode, reference: b.reference ?? null, note: b.note ?? null, deletedById: null, createdById: u.id }));
    }
    const unitMatch = p.match(/^\/accounts\/units\/([^/]+)$/);
    if (unitMatch && method === 'DELETE') {
      if (live(s, 'moneyEntry').some((e) => e.unitId === unitMatch[1])) throw new DemoError(409, 'This flat has payments; remove them first', 'has_payments');
      return out(bump('unit', { ...find(s, 'unit', unitMatch[1]), id: unitMatch[1]!, deletedAt: new Date().toISOString() }));
    }
    if (p === '/accounts/units') {
      const before = find(s, 'unit', b.id);
      return out(bump('unit', { ...(before ?? { createdById: u.id }), id: (b.id as string | undefined) ?? randomUUID(), projectId: b.projectId, name: b.name, buyerName: b.buyerName ?? null, buyerPhone: b.buyerPhone ?? null, dealPaise: b.dealPaise ?? null, note: b.note ?? null, deletedAt: null }));
    }
    const site = q('projectId');
    const inSite = (r: DemoRow) => !site || r.projectId === site;
    const contractor = (id: unknown) => (find(s, 'contractor', id)?.name as string | undefined) ?? null;
    const at = (r: DemoRow) => String(r.createdAt ?? new Date().toISOString());
    const lines: BookLine[] = [
      ...rows(s, 'moneyEntry').filter((e) => inSite(e) && (!e.deletedAt || e.deletedById)).map((e) => ({
        id: e.id, source: 'entry' as const, projectId: (e.projectId as string | null) ?? null, direction: e.direction as 'in' | 'out', kind: e.kind as BookLine['kind'], unitId: (e.unitId as string | null) ?? null, party: (e.party as string | null) ?? null,
        amountPaise: Number(e.amountPaise), date: String(e.date), mode: e.mode as BookLine['mode'], reference: (e.reference as string | null) ?? null, note: (e.note as string | null) ?? null, by: name(e.createdById), byId: (e.createdById as string | null) ?? null, at: at(e),
        removed: e.deletedAt ? { by: name(e.deletedById), at: String(e.deletedAt) } : null,
      })),
      ...live(s, 'supplierPayment').filter(inSite).map((x) => ({
        id: x.id, source: 'supplier' as const, projectId: (x.projectId as string | null) ?? null, direction: 'out' as const, kind: 'supplier' as const, unitId: null, party: (find(s, 'supplier', x.supplierId)?.name as string | undefined) ?? null,
        amountPaise: Number(x.amountPaise), date: String(x.date), mode: x.mode as BookLine['mode'], reference: (x.reference as string | null) ?? null, note: null, by: name(x.createdById), byId: (x.createdById as string | null) ?? null, at: at(x), removed: null,
      })),
      ...live(s, 'advance').filter(inSite).map((x) => ({
        id: x.id, source: 'upad' as const, projectId: String(x.projectId), direction: 'out' as const, kind: 'upad' as const, unitId: null, party: contractor(x.contractorId),
        amountPaise: Number(x.amountPaise), date: String(x.date), mode: x.mode as BookLine['mode'], reference: null, note: null, by: name(x.createdById), byId: (x.createdById as string | null) ?? null, at: at(x), removed: null,
      })),
      ...live(s, 'wageSettlement').filter((w) => inSite(w) && w.status === 'paid' && Number(w.netPaise) > 0).map((w) => ({
        id: w.id, source: 'wages' as const, projectId: String(w.projectId), direction: 'out' as const, kind: 'wages' as const, unitId: null, party: contractor(w.contractorId),
        amountPaise: Number(w.netPaise), date: String(w.paidAt ?? w.updatedAt ?? today).slice(0, 10), mode: (w.paidMode as BookLine['mode']) ?? null, reference: null, note: `${String(w.periodFrom)} – ${String(w.periodTo)}`, by: name(w.approvedById ?? w.createdById), byId: null, at: at(w), removed: null,
      })),
    ].sort((x, y) => y.date.localeCompare(x.date) || y.at.localeCompare(x.at));
    return {
      lines,
      totals: bookTotals(lines),
      units: live(s, 'unit').filter(inSite).sort((x, y) => String(x.name).localeCompare(String(y.name))).map((x) => ({
        id: x.id, projectId: String(x.projectId), name: String(x.name), buyerName: (x.buyerName as string | null) ?? null, buyerPhone: (x.buyerPhone as string | null) ?? null, note: (x.note as string | null) ?? null,
        dealPaise: x.dealPaise == null ? null : Number(x.dealPaise), ...unitAccount(x.dealPaise == null ? null : Number(x.dealPaise), lines, x.id),
      })),
    };
  }
  const rateMatch = p.match(/^\/registers\/grn-lines\/([^/]+)\/rate$/);
  if (rateMatch) return out(bump('grnLine', { ...find(s, 'grnLine', rateMatch[1]), id: rateMatch[1]!, ratePaise: b.ratePaise }));
  if (p === '/registers/photos') {
    return live(s, 'photo').filter((x) => x.projectId === q('projectId') && String(x.takenAt).slice(0, 10) >= String(q('from')) && String(x.takenAt).slice(0, 10) <= String(q('to'))).map((x) => ({ ...x, uploaded: true }));
  }
  throw new DemoError(404, `Not in the demo: ${p}`, 'not_found');
}

/** Today's site summary as text, for the demo's "Send report" (the real app shares a PDF). */
export async function demoReportText(projectId: string): Promise<string> {
  const s = await load();
  const x = summary(s, projectId, isoDate());
  const l = lang(s);
  return [
    `${tr(l, 'report.daily')} · ${x.project.name} · ${x.date}`,
    `${tr(l, 'report.labour')}: ${x.labour.workers} ${tr(l, 'report.workers')} (${tr(l, 'report.yesterday')} ${x.labour.yesterday})`,
    ...x.materialIn.map((m) => `↓ ${l === 'en' ? m.material : m.materialGu} ${m.qty} ${m.unit}${m.supplier ? ` · ${m.supplier}` : ''}`),
    ...x.materialUsed.map((m) => `↑ ${l === 'en' ? m.material : m.materialGu} ${m.qty} ${m.unit}${m.floor ? ` · ${m.floor}` : ''}`),
    ...x.progress.map((p) => `✓ ${l === 'en' ? p.workItem : p.workItemGu}${p.floor ? ` · ${p.floor}` : ''} ${p.percent}%`),
    ...x.alerts.map((a) => `⚠ ${noticeText(l, a)}`),
  ].join('\n');
}

export const DEMO_PEOPLE = DEMO_USERS;

/** Photos taken in the demo stay on this phone, keyed by photo id, so every role can see them. */
export async function saveDemoPhoto(photoId: string, blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  await kv.set(`demo:photo:${photoId}`, dataUrl);
}
export const demoPhoto = (photoId: string) => kv.get(`demo:photo:${photoId}`);
