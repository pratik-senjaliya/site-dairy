import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookTotals, moneyEntrySchema, payStagesSchema, unitAccount, unitSchedule } from './accounts';
import { addDays, daysBetween, isoDate, shortDate, wageWeek } from './dates';
import { formatPaise, rupeesToPaise } from './money';
import { phoneSchema } from './schemas';
import { acceptedQty, isLowStock, stockDaysLeft, stockDelta, stockOnHand } from './stock';
import { settleWages } from './wages';
import { contractorBill, measureAmount, workTotals } from './work';

test('wages: days × rate − advances, half days and overtime', () => {
  const r = settleWages({
    attendance: [
      { skillId: 'kadiya', count: 4, halfDayCount: 2, otHours: 4 },
      { skillId: 'majur', count: 10, halfDayCount: 0, otHours: 0 },
    ],
    dailyRates: { kadiya: rupeesToPaise(900), majur: rupeesToPaise(550) },
    advances: rupeesToPaise(2000),
  });
  assert.equal(r.manDays, 15);
  // kadiya 5 days × 900 + 4h × 900/8 = 4950; majur 10 × 550 = 5500
  assert.equal(r.gross, rupeesToPaise(10450));
  assert.equal(r.net, rupeesToPaise(8450));
  assert.deepEqual(r.missingRates, []);
});

test('wages: a skill without a rate is reported, not silently paid at zero', () => {
  const r = settleWages({ attendance: [{ skillId: 'luhar', count: 2, halfDayCount: 0, otHours: 0 }], dailyRates: {}, advances: 0 });
  assert.deepEqual(r.missingRates, ['luhar']);
  assert.equal(r.gross, 0);
});

test('stock: received − issued ± transfers, rejected quantity excluded', () => {
  const deltas = [
    stockDelta('grn', acceptedQty(100, 2)),
    stockDelta('issue', 30.5),
    stockDelta('transfer_out', 10),
    stockDelta('transfer_in', 0.1),
  ];
  assert.equal(stockOnHand(deltas), 57.6);
  assert.equal(isLowStock(57.6, 60), true);
  assert.equal(isLowStock(57.6, null), false);
  assert.throws(() => acceptedQty(5, 6));
  assert.throws(() => stockDelta('issue', -1));
});

test('dates are Asia/Kolkata days', () => {
  // 20:00 UTC on 14 Oct is 01:30 on 15 Oct in India.
  assert.equal(isoDate(new Date('2026-10-14T20:00:00Z')), '2026-10-15');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(daysBetween('2026-10-01', '2026-10-03'), ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('money formats with Indian grouping', () => {
  assert.equal(formatPaise(rupeesToPaise(125000)), '₹1,25,000');
  assert.equal(formatPaise(12345), '₹123.45');
});

test('phone numbers normalise to +91', () => {
  assert.equal(phoneSchema.parse('98250 12345'), '+919825012345');
  assert.equal(phoneSchema.safeParse('12345').success, false);
});

test('settlement period uses the rate in force on each day', async () => {
  const { settlePeriod } = await import('./wages');
  const rates = [
    { skillId: 'k', dailyRatePaise: 80000, effectiveFrom: '2026-10-01' },
    { skillId: 'k', dailyRatePaise: 90000, effectiveFrom: '2026-10-10' },
  ];
  const line = { skillId: 'k', count: 2, halfDayCount: 0, otHours: 0 };
  const r = settlePeriod([{ ...line, date: '2026-10-09' }, { ...line, date: '2026-10-10' }], rates, 50000);
  assert.equal(r.gross, 2 * 80000 + 2 * 90000);
  assert.equal(r.net, 340000 - 50000);
  const none = settlePeriod([{ ...line, date: '2026-09-30' }], rates, 0);
  assert.deepEqual(none.missingRates, ['k'], 'no rate before the first effective date');
});

test('plans: pilot ends after 60 days, basic allows 5 people per active site', async () => {
  const { planStatus } = await import('./plans');
  const pilot = planStatus('pilot', '2026-10-01', '2026-10-21', 1);
  assert.deepEqual([pilot.endsOn, pilot.daysLeft, pilot.maxActiveSites], ['2026-11-30', 40, 5]);
  assert.equal(planStatus('basic', '2026-01-01', '2026-10-21', 3).maxUsers, 15);
  assert.equal(planStatus('pro', '2026-01-01', '2026-10-21', 3).maxUsers, null);
});

test('wage week ends on the wage day', () => {
  // 2026-10-22 is a Thursday; wages are paid on Saturday (6).
  assert.deepEqual(wageWeek('2026-10-22', 6), { from: '2026-10-18', to: '2026-10-24' });
  assert.deepEqual(wageWeek('2026-10-22', 6, 1), { from: '2026-10-11', to: '2026-10-17' });
  assert.deepEqual(wageWeek('2026-10-24', 6), { from: '2026-10-18', to: '2026-10-24' }, 'the wage day closes its own week');
  assert.deepEqual(wageWeek('2026-10-25', 6), { from: '2026-10-25', to: '2026-10-31' });
  assert.deepEqual(wageWeek('2026-10-22', 0), { from: '2026-10-19', to: '2026-10-25' });
  assert.equal(shortDate('2026-10-08'), '08/10');
});

test('stock days left at the recent rate of use', () => {
  // 270 bags used over 6 working days = 45 a day; 100 on hand lasts 2 full days.
  assert.deepEqual(stockDaysLeft(100, 270, 6), { perDay: 45, days: 2 });
  assert.deepEqual(stockDaysLeft(-5, 10, 2), { perDay: 5, days: 0 });
  assert.equal(stockDaysLeft(100, 0, 6), null, 'not used lately');
  assert.equal(stockDaysLeft(100, 10, 0), null);
});

test('accounts: removed lines do not count; in hand = in − out', () => {
  const line = (direction: 'in' | 'out', amountPaise: number, removed = false, unitId: string | null = null) => ({ direction, amountPaise, unitId, removed: removed ? { by: 'x', at: '2026-10-27' } : null });
  const lines = [line('in', 500000, false, 'a101'), line('in', 200000, false, 'a101'), line('in', 900000, true, 'a101'), line('out', 300000), line('out', 50000, true)];
  assert.deepEqual(bookTotals(lines), { inPaise: 700000, outPaise: 300000, balancePaise: 400000 });
  assert.deepEqual(unitAccount(1000000, lines, 'a101'), { receivedPaise: 700000, duePaise: 300000 });
  assert.deepEqual(unitAccount(null, lines, 'a102'), { receivedPaise: 0, duePaise: null });
});

test('accounts: a buyer payment needs the flat; kinds follow the direction', () => {
  const base = { direction: 'in', amountPaise: 100, date: '2026-10-27', mode: 'cheque' } as const;
  assert.equal(moneyEntrySchema.safeParse({ ...base, kind: 'flat' }).success, false);
  assert.equal(moneyEntrySchema.safeParse({ ...base, kind: 'flat', unitId: '6f333777-ca21-43ad-b1ef-8caadba2b246' }).success, true);
  assert.equal(moneyEntrySchema.safeParse({ ...base, kind: 'labour' }).success, false);
  assert.equal(moneyEntrySchema.safeParse({ ...base, direction: 'out', kind: 'labour' }).success, true);
});

test('measured work: qty × rate per kind of work, added to days only for contractors paid by the day', () => {
  assert.equal(measureAmount(2450.5, 2200), 5391100);
  const work = workTotals([
    { workId: 'slab', qty: 2450, ratePaise: 2200 },
    { workId: 'slab', qty: 1200.25, ratePaise: 2400 },
    { workId: 'beam', qty: 300, ratePaise: 1500 },
  ]);
  assert.deepEqual(work.lines.find((l) => l.workId === 'slab'), { workId: 'slab', qty: 3650.25, amount: 5390000 + 2880600 });
  assert.equal(work.gross, 5390000 + 2880600 + 450000);
  const days = { manDays: 10, gross: 800000, advances: 3000000, net: -2200000, missingRates: ['mason'] };
  // Centering paid per sq ft: the men marked present are head count, not paid; upad comes off the work.
  const piece = contractorBill(days, false, work.gross);
  assert.equal(piece.gross, work.gross);
  assert.equal(piece.net, work.gross - 3000000);
  assert.deepEqual(piece.missingRates, []);
  const daily = contractorBill(days, true, 450000);
  assert.equal(daily.gross, 1250000);
  assert.deepEqual(daily.missingRates, ['mason']);
});

test('buyer instalments: stage amounts, due when reached, payments fill stages in order', () => {
  const stages = [
    { id: 'b', name: 'Booking', percent: 10, sort: 0, reachedOn: '2026-10-01' },
    { id: 'p', name: 'Plinth', percent: 15, sort: 1, reachedOn: '2026-10-20' },
    { id: 's1', name: 'Slab 1', percent: 33.33, sort: 2, reachedOn: null },
    { id: 'x', name: 'Possession', percent: 41.67, sort: 3, reachedOn: null },
  ];
  const r = unitSchedule(4500001, stages, 600000_00);
  assert.deepEqual(r.stages.map((s) => s.amountPaise), [450000, 675000, 1499850, 4500001 - 450000 - 675000 - 1499850]);
  assert.equal(r.duePaise, 1125000);
  assert.equal(r.dueNowPaise, 0, 'paid more than has fallen due');
  const part = unitSchedule(45_00_000_00, stages, 5_00_000_00);
  assert.equal(part.dueNowPaise, 4_50_000_00 + 6_75_000_00 - 5_00_000_00);
  assert.deepEqual(part.stages.slice(0, 2).map((s) => s.paidPaise), [4_50_000_00, 50_000_00]);
  assert.equal(unitSchedule(null, stages, 0).dueNowPaise, null, 'no deal, nothing to schedule');
  assert.equal(payStagesSchema.safeParse({ projectId: '6f1d3a4e-8c2b-4f5a-9d6e-1a2b3c4d5e6f', stages: [{ name: 'A', percent: 60 }, { name: 'B', percent: 50 }] }).success, false);
});
