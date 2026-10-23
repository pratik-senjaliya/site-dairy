import { isoDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ask, Button, Card, Chip, Input, Row, Screen, T } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { db, useDb } from '../../lib/db';
import { useOnline } from '../../lib/hooks';
import { useName, useT } from '../../lib/i18n';
import { TRADES, toPaise, useSave, type Rate } from '../../lib/setup';

// One contractor: name, number, trade, and the daily rate for each kind of worker they send.
// A changed rate starts today; earlier days keep the old rate in the hisab.
export default function Contractor() {
  const t = useT();
  const name = useName();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { busy, run } = useSave();
  const skills = useDb(() => db.rows('skill').slice().sort((a, b) => Number(a.sort) - Number(b.sort)));
  const existing = useDb(() => (id ? db.find('contractor', id) : undefined));
  const rates = useOnline<Rate[]>(id ? `/masters/contractorRate?contractorId=${id}` : null);
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState<string>('Civil');
  const [rupees, setRupees] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!existing) return;
    setTitle(String(existing.name));
    setPhone(String(existing.phone ?? '').replace('+91', ''));
    setTrade(String(existing.trade ?? 'Civil'));
  }, [existing]);
  const current = (skillId: string) => rates.data?.find((r) => r.skillId === skillId);
  useEffect(() => {
    if (!rates.data) return;
    const r: Record<string, string> = {};
    for (const x of rates.data) if (!(x.skillId in r)) r[x.skillId] = String(x.dailyRatePaise / 100);
    setRupees(r);
  }, [rates.data]);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const ok = title.trim().length >= 2 && (!digits || digits.length === 10);

  const save = () => void run(async () => {
    const body = { name: title.trim(), phone: digits || '', trade, rateType: 'daily' };
    const c = id ? await patch<{ id: string }>(`/masters/contractor/${id}`, body) : await post<{ id: string }>('/masters/contractor', body);
    const today = isoDate();
    for (const s of skills) {
      const paise = toPaise(rupees[s.id] ?? '');
      const was = current(s.id);
      if (!paise || paise === was?.dailyRatePaise) continue;
      const rate = { contractorId: c.id, skillId: s.id, dailyRatePaise: paise, effectiveFrom: today };
      if (was && was.effectiveFrom.slice(0, 10) === today) await patch(`/masters/contractorRate/${was.id}`, rate);
      else await post('/masters/contractorRate', rate);
    }
    router.back();
  });

  const extra = trade && !(TRADES as readonly string[]).includes(trade) ? trade : null;
  return (
    <Screen title={id ? title || t('setup.contractors') : t('setup.addContractor')} footer={<Button label={t('common.save')} icon="check" busy={busy} disabled={!ok} onPress={save} />}>
      <Ask q={t('setup.qContractorName')}>
        <Input value={title} onChangeText={setTitle} placeholder="Bharat Construction" accessibilityLabel={t('setup.qContractorName')} autoFocus={!id} />
      </Ask>
      <Ask q={t('setup.qPhone')} optional>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98250 12345" maxLength={14} accessibilityLabel={t('setup.qPhone')} />
      </Ask>
      <Ask q={t('setup.qTrade')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {TRADES.map((v) => <Chip key={v} label={t(`trade.${v}`)} selected={trade === v} onPress={() => setTrade(v)} />)}
          {extra ? <Chip label={extra} selected /> : null}
        </View>
      </Ask>
      <Ask q={t('setup.qRates')} hint={t('setup.ratesHint')}>
        <Card style={{ gap: spacing.sm }}>
          {skills.map((s) => (
            <Row key={s.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><T.body bold>{name(s)}</T.body></View>
              <T.body muted>₹</T.body>
              <Input
                value={rupees[s.id] ?? ''}
                onChangeText={(v) => setRupees((r) => ({ ...r, [s.id]: v.replace(/[^\d.]/g, '') }))}
                keyboardType="number-pad"
                placeholder="—"
                accessibilityLabel={`${name(s)} ₹`}
                style={{ width: 110, textAlign: 'right', fontSize: 18, fontWeight: '700' }}
              />
            </Row>
          ))}
        </Card>
      </Ask>
    </Screen>
  );
}
