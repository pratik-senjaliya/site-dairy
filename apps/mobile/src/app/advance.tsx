import { isoDate, rupeesToPaise, formatPaise } from '@site-diary/shared';
import { useState } from 'react';
import { RowChips } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Button, Chips, Field, Input, Screen } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';

// M5: upad (advance) — contractor, amount, cash/UPI/bank.
export default function Advance() {
  const t = useT();
  const { siteId } = useSite();
  const contractors = useDb(() => db.rows('contractor'));
  const recent = useDb(() => db.rows('advance').filter((a) => a.projectId === siteId && a.date === isoDate()));
  const [contractorId, setContractor] = useState<string | null>(null);
  const [workerId, setWorker] = useState<string | null>(null);
  const workers = useDb(() => db.rows('worker').filter((w) => w.contractorId === contractorId));
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const rupees = Number(amount.replace(/[^\d]/g, ''));

  return (
    <Screen
      title={t('home.advance')}
      footer={<Button label={rupees ? `${t('common.save')} · ${formatPaise(rupeesToPaise(rupees))}` : t('common.save')} disabled={!contractorId || !rupees || !siteId} onPress={() => {
        db.save('advance', { projectId: siteId, contractorId, workerId, amountPaise: rupeesToPaise(rupees), date: isoDate(), mode });
        notice(t('common.saved'));
        done();
      }} />}
    >
      <RowChips label={t('report.contractor')} rows={contractors} value={contractorId} onChange={(id) => { setContractor(id); setWorker(null); }} nameOf={(r) => String(r.name)} />
      {workers.length ? <RowChips label={t('advance.worker')} rows={workers} value={workerId} onChange={setWorker} nameOf={(r) => String(r.name)} allowNone noneLabel={t('advance.wholeContractor')} /> : null}
      <Field label={t('advance.amount')}>
        <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 2,000" style={{ fontSize: 24 }} />
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
