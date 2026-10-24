import { formatPaise, isoDate, rupeesToPaise, wageWeek } from '@site-diary/shared';
import { useState } from 'react';
import { byUse, QuickAdd, RowChips } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Ask, Banner, Button, Chips, DiaryLine, Input, Screen } from '../components/ui';
import { post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useDiary } from '../lib/diary';

type Mode = 'cash' | 'upi' | 'bank';

// M5: upad (advance), as the cash diary: to whom, how much, how it was paid.
export default function Advance() {
  const t = useT();
  const { siteId } = useSite();
  const { me } = useSession();
  const contractors = useDb(() => byUse(db.rows('contractor'), db.rows('attendanceEntry').filter((a) => a.projectId === siteId).map((a) => a.contractorId)));
  const recent = useDb(() => db.rows('advance').filter((a) => a.projectId === siteId && a.date === isoDate()));
  const [contractorId, setContractor] = useState<string | null>(null);
  const [workerId, setWorker] = useState<string | null>(null);
  const workers = useDb(() => db.rows('worker').filter((w) => w.contractorId === contractorId));
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('cash');
  // Fixing a mistake: today's entry goes back into the form, saved again under the same id.
  const [editId, setEditId] = useState<string | null>(null);
  const edit = (id: string) => {
    const a = db.find('advance', id);
    if (!a) return;
    setEditId(id);
    setContractor(String(a.contractorId));
    setWorker((a.workerId as string | null) ?? null);
    setAmount(String(Number(a.amountPaise) / 100));
    setMode((a.mode as Mode) ?? 'cash');
  };
  const rupees = Number(amount.replace(/[^\d]/g, ''));

  // Before giving money: what this contractor's people worked this week and the upad still to be settled.
  const week = wageWeek(isoDate(), me?.company.settings.wageDay ?? 6);
  const sofar = useDb(() => {
    if (!contractorId) return null;
    const days = db.rows('attendanceEntry').filter((a) => a.projectId === siteId && a.contractorId === contractorId && String(a.date) >= week.from && String(a.date) <= week.to)
      .reduce((x, a) => x + Number(a.count) + Number(a.halfDayCount) / 2, 0);
    const open = db.rows('advance').filter((a) => a.projectId === siteId && a.contractorId === contractorId && !a.settlementId).reduce((x, a) => x + Number(a.amountPaise), 0);
    return { days, open };
  });

  const line = useDiary().advance;
  const draft = { contractorId, workerId, amountPaise: rupeesToPaise(rupees), mode };

  return (
    <Screen
      title={t('home.advance')}
      footer={
        <>
          {contractorId && rupees ? <DiaryLine text={line(draft)} /> : null}
          <Button label={editId ? t('common.saveChange') : t('common.save')} disabled={!contractorId || !rupees || !siteId} onPress={() => {
            db.save('advance', editId ? { id: editId, ...draft } : { projectId: siteId, ...draft, date: isoDate() });
            notice(t('common.saved'));
            done();
          }} />
        </>
      }
    >
      {editId ? <Banner tone="info" text={t('common.editingHint')} onPress={() => { setEditId(null); setAmount(''); }} /> : null}
      <Ask q={t('advance.qWho')}>
        <RowChips label="" rows={contractors} max={8} value={contractorId} onChange={(id) => { setContractor(id); setWorker(null); }} nameOf={(r) => String(r.name)} />
      </Ask>
      {sofar ? <Banner tone="info" text={t('advance.sofar', { days: sofar.days, amount: formatPaise(sofar.open) })} /> : null}
      {contractorId ? (
        <Ask q={t('advance.qWorker')} optional>
          <RowChips label="" rows={workers} value={workerId} onChange={setWorker} nameOf={(r) => String(r.name)} allowNone noneLabel={t('advance.wholeContractor')} />
          <QuickAdd label={t('advance.newWorker')} placeholder="Ramesh" onAdd={async (n) => {
            const w = await post<{ id: string }>('/masters/worker', { contractorId, name: n });
            await db.sync();
            setWorker(w.id);
          }} />
        </Ask>
      ) : null}
      <Ask q={t('advance.qAmount')}>
        <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 2,000" accessibilityLabel={t('advance.amount')} style={{ fontSize: 24 }} />
        <Chips options={[500, 1000, 2000, 5000, 10000].map((r) => ({ value: String(r), label: formatPaise(rupeesToPaise(r)) }))} value={String(rupees)} onChange={setAmount} />
      </Ask>
      <Ask q={t('advance.qMode')}>
        <Chips<Mode> options={[{ value: 'cash', label: t('pay.cash') }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: t('pay.bank') }]} value={mode} onChange={setMode} />
      </Ask>
      <TodayEntries editing={editId} onEdit={edit} entries={recent.map((a) => ({ id: a.id, table: 'advance' as const, label: line(a), locked: a.settlementId ? '✓' : undefined }))} />
    </Screen>
  );
}
