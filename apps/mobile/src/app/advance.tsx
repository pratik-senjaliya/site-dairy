import { formatPaise, isoDate, rupeesToPaise, wageWeek } from '@site-diary/shared';
import { useState } from 'react';
import { byUse, RowChips } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Banner, Button, Chips, Field, Input, Screen } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';

// M5: upad (advance) — contractor, amount, cash/UPI/bank.
export default function Advance() {
  const t = useT();
  const { siteId } = useSite();
  const contractors = useDb(() => byUse(db.rows('contractor'), db.rows('attendanceEntry').filter((a) => a.projectId === siteId).map((a) => a.contractorId)));
  const recent = useDb(() => db.rows('advance').filter((a) => a.projectId === siteId && a.date === isoDate()));
  const [contractorId, setContractor] = useState<string | null>(null);
  const [workerId, setWorker] = useState<string | null>(null);
  const workers = useDb(() => db.rows('worker').filter((w) => w.contractorId === contractorId));
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const rupees = Number(amount.replace(/[^\d]/g, ''));
  // Before giving money: what this contractor's people worked this week and the upad still to be settled.
  const { me } = useSession();
  const week = wageWeek(isoDate(), me?.company.settings.wageDay ?? 6);
  const sofar = useDb(() => {
    if (!contractorId) return null;
    const days = db.rows('attendanceEntry').filter((a) => a.projectId === siteId && a.contractorId === contractorId && String(a.date) >= week.from && String(a.date) <= week.to)
      .reduce((x, a) => x + Number(a.count) + Number(a.halfDayCount) / 2, 0);
    const open = db.rows('advance').filter((a) => a.projectId === siteId && a.contractorId === contractorId && !a.settlementId).reduce((x, a) => x + Number(a.amountPaise), 0);
    return { days, open };
  });

  return (
    <Screen
      title={t('home.advance')}
      footer={<Button label={rupees ? `${t('common.save')} · ${formatPaise(rupeesToPaise(rupees))}` : t('common.save')} disabled={!contractorId || !rupees || !siteId} onPress={() => {
        db.save('advance', { projectId: siteId, contractorId, workerId, amountPaise: rupeesToPaise(rupees), date: isoDate(), mode });
        notice(t('common.saved'));
        done();
      }} />}
    >
      <RowChips label={t('report.contractor')} rows={contractors} max={8} value={contractorId} onChange={(id) => { setContractor(id); setWorker(null); }} nameOf={(r) => String(r.name)} />
      {sofar ? <Banner tone="info" text={t('advance.sofar', { days: sofar.days, amount: formatPaise(sofar.open) })} /> : null}
      {workers.length ? <RowChips label={t('advance.worker')} rows={workers} value={workerId} onChange={setWorker} nameOf={(r) => String(r.name)} allowNone noneLabel={t('advance.wholeContractor')} /> : null}
      <Field label={t('advance.amount')}>
        <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 2,000" style={{ fontSize: 24 }} />
        <Chips options={[500, 1000, 2000, 5000, 10000].map((r) => ({ value: String(r), label: formatPaise(rupeesToPaise(r)) }))} value={String(rupees)} onChange={setAmount} />
      </Field>
      <Field label={t('advance.mode')}>
        <Chips options={[{ value: 'cash', label: t('pay.cash') }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: t('pay.bank') }]} value={mode} onChange={setMode} />
      </Field>
      <TodayEntries entries={recent.map((a) => ({
        id: a.id, table: 'advance' as const,
        label: `${String(contractors.find((c) => c.id === a.contractorId)?.name ?? '')} · ${formatPaise(Number(a.amountPaise))}`,
        sub: [String(a.date), String(db.find('worker', a.workerId as string)?.name ?? '')].filter(Boolean).join(' · '),
        locked: a.settlementId ? '✓' : undefined,
      }))} />
    </Screen>
  );
}
