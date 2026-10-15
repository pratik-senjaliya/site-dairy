import { isoDate, rupeesToPaise, formatPaise } from '@site-diary/shared';
import { useState } from 'react';
import { RowChips } from '../components/pickers';
import { Button, Card, Chips, Field, Input, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';

// M5: upad (advance) — contractor, amount, cash/UPI/bank.
export default function Advance() {
  const t = useT();
  const { siteId } = useSite();
  const contractors = useDb(() => db.rows('contractor'));
  const recent = useDb(() => db.rows('advance').filter((a) => a.projectId === siteId).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5));
  const [contractorId, setContractor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const rupees = Number(amount.replace(/[^\d]/g, ''));

  return (
    <Screen
      title={t('home.advance')}
      footer={<Button label={rupees ? `${t('common.save')} · ${formatPaise(rupeesToPaise(rupees))}` : t('common.save')} disabled={!contractorId || !rupees || !siteId} onPress={() => {
        db.save('advance', { projectId: siteId, contractorId, amountPaise: rupeesToPaise(rupees), date: isoDate(), mode });
        notice(t('common.saved'));
        done();
      }} />}
    >
      <RowChips label={t('report.contractor')} rows={contractors} value={contractorId} onChange={setContractor} nameOf={(r) => String(r.name)} />
      <Field label={t('advance.amount')}>
        <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 2,000" style={{ fontSize: 24 }} />
      </Field>
      <Field label={t('advance.mode')}>
        <Chips options={[{ value: 'cash', label: t('pay.cash') }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: t('pay.bank') }]} value={mode} onChange={setMode} />
      </Field>
      {recent.length ? (
        <Card>
          <T.h2>{t('advance.recent')}</T.h2>
          {recent.map((a) => <T.body key={a.id}>{String(a.date)} · {String(contractors.find((c) => c.id === a.contractorId)?.name ?? '')} · {formatPaise(Number(a.amountPaise))}</T.body>)}
        </Card>
      ) : null}
    </Screen>
  );
}
