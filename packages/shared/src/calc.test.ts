import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, isoDate, shortDate, wageWeek } from './dates';
import { formatPaise, rupeesToPaise } from './money';
import { phoneSchema } from './schemas';
import { acceptedQty, isLowStock, stockDelta, stockOnHand } from './stock';
import { settleWages } from './wages';

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
  assert.deepEqual([pilot.endsOn, pilot.daysLeft, pilot.maxActiveSites], ['2026-11-30', 40, 2]);
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
