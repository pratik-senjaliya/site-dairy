import { formatPaise, isoDate, MONEY_IN_KINDS, MONEY_OUT_KINDS, rupeesToPaise, shortDate, type MoneyKind, type PayMode } from '@site-diary/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { DayStep, PayModeField, useModeText } from '../components/pickers';
import { Ask, Banner, Chip, Chips, DiaryLine, Button, Input, Row, Screen } from '../components/ui';
import { post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { done, notice, useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useContractorName, useSave, type Book } from '../lib/setup';

// One line of the partners' book, asked like the cash diary: in or out, for what, whose, how much, when, how.
export default function Money() {
  const t = useT();
  const { me } = useSession();
  const params = useLocalSearchParams<{ dir?: string; site?: string; unit?: string }>();
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [dir, setDir] = useState<'in' | 'out'>(params.dir === 'out' ? 'out' : 'in');
  const [site, setSite] = useState<string | null>(params.site ?? (sites.length === 1 ? sites[0]!.id : null));
  const [kind, setKind] = useState<MoneyKind | null>(params.unit ? 'flat' : null);
  const [unitId, setUnit] = useState<string | null>(params.unit ?? null);
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(isoDate());
  const [mode, setMode] = useState<PayMode>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const { busy, run } = useSave();
  const modeText = useModeText();
  const contractorName = useContractorName();
  const book = useOnline<Book>('/accounts');
  const units = (book.data?.units ?? []).filter((u) => !site || u.projectId === site);
  const flat = units.find((u) => u.id === unitId) ?? book.data?.units.find((u) => u.id === unitId);
  // Quick picks for "whose": contractors for labour, suppliers for material, partners for partner money.
  const people = useDb(() => {
    if (kind === 'labour') return db.rows('contractor').map((c) => contractorName(c));
    if (kind === 'material') return db.rows('supplier').map((c) => String(c.name));
    if (kind === 'partner') return db.rows('user').filter((u) => u.role === 'partner' || u.role === 'owner').map((u) => String(u.name));
    return [];
  });
  const rupees = Number(amount.replace(/[^\d]/g, ''));
  const kinds = dir === 'in' ? MONEY_IN_KINDS : MONEY_OUT_KINDS;
  const what = kind === 'flat' ? [flat?.name, flat?.buyerName].filter(Boolean).join(' · ') : party.trim() || (kind ? t(`money.${dir}.${kind}` as 'money.in.flat') : '');
  const ready = !!kind && rupees > 0 && (kind !== 'flat' || !!unitId) && (mode !== 'cheque' || reference.trim().length > 0);
  const line = ready ? t(dir === 'in' ? 'money.lineIn' : 'money.lineOut', { what, amount: formatPaise(rupeesToPaise(rupees)), mode: modeText(mode, reference.trim() || null), date: shortDate(date) }) : null;

  const save = () => void run(async () => {
    await post('/accounts/entries', {
      id: randomUUID(), direction: dir, kind, projectId: site, unitId: kind === 'flat' ? unitId : null, party: kind === 'flat' ? null : party.trim() || null,
      amountPaise: rupeesToPaise(rupees), date, mode, reference: reference.trim() || null, note: note.trim() || null,
    });
    notice(t('common.saved'));
    done();
  });

  return (
    <Screen
      title={dir === 'in' ? t('accounts.addIn') : t('accounts.addOut')}
      footer={
        <>
          {line ? <DiaryLine text={line} /> : null}
          <Button label={t('common.save')} busy={busy} disabled={!ready} onPress={save} />
        </>
      }
    >
      {book.error === 'offline' ? <Banner tone="error" text={t('common.offlineOnline')} onPress={() => void book.reload()} /> : null}
      <Chips<'in' | 'out'> options={[{ value: 'in', label: t('accounts.addIn') }, { value: 'out', label: t('accounts.addOut') }]} value={dir} onChange={(d) => { setDir(d); setKind(null); setParty(''); }} />
      {sites.length > 1 || kind !== 'flat' ? (
        <Ask q={t('money.qSite')}>
          <Chips<string> options={[...sites.map((p) => ({ value: p.id, label: p.name })), ...(kind === 'flat' ? [] : [{ value: '', label: t('money.noSite') }])]} value={site ?? ''} onChange={(v) => { setSite(v || null); setUnit(null); }} />
        </Ask>
      ) : null}
      <Ask q={dir === 'in' ? t('money.qKindIn') : t('money.qKindOut')}>
        <Chips<MoneyKind> options={kinds.map((k) => ({ value: k, label: t(`money.${dir}.${k}` as 'money.in.flat') }))} value={kind} onChange={(k) => { setKind(k); setParty(''); }} />
      </Ask>
      {kind === 'material' && dir === 'out' ? <Banner tone="info" text={t('money.materialHint')} onPress={() => router.push('/suppliers')} /> : null}
      {kind === 'labour' && dir === 'out' ? <Banner tone="info" text={t('money.labourHint')} /> : null}

      {kind === 'flat' ? (
        <Ask q={t('money.qFlat')}>
          <Row style={{ flexWrap: 'wrap' }}>
            {units.map((u) => <Chip key={u.id} label={[u.name, u.buyerName].filter(Boolean).join(' · ')} selected={u.id === unitId} onPress={() => setUnit(u.id)} />)}
            <Chip icon="plus" label={t('money.newFlat')} onPress={() => router.push({ pathname: '/unit', params: site ? { site } : {} })} />
          </Row>
          {flat?.duePaise ? <Banner tone="info" text={t('accounts.due', { amount: formatPaise(flat.duePaise) })} onPress={() => setAmount(String(Math.round(flat.duePaise! / 100)))} /> : null}
        </Ask>
      ) : kind ? (
        <Ask q={dir === 'in' ? t('money.qFrom') : t('money.qTo')} optional={kind !== 'labour' && kind !== 'material'}>
          {people.length ? <Row style={{ flexWrap: 'wrap' }}>{people.slice(0, 8).map((n) => <Chip key={n} label={n} selected={party === n} onPress={() => setParty(n)} />)}</Row> : null}
          <Input value={party} onChangeText={setParty} placeholder={kind === 'labour' ? 'Jay Ambe Centering' : kind === 'material' ? 'Patel Hardware' : 'Rameshbhai'} accessibilityLabel={dir === 'in' ? t('money.qFrom') : t('money.qTo')} maxLength={120} />
        </Ask>
      ) : null}

      <Ask q={t('money.qAmount')}>
        <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 5,00,000" accessibilityLabel={t('money.qAmount')} style={{ fontSize: 24 }} />
        {rupees ? <AmountEcho paise={rupeesToPaise(rupees)} /> : null}
      </Ask>
      <Ask q={t('money.qDate')}>
        <DayStep value={date} onChange={setDate} />
      </Ask>
      <Ask q={t('money.qMode')}>
        <PayModeField mode={mode} onMode={setMode} reference={reference} onReference={setReference} />
      </Ask>
      <Ask q={t('money.note')} optional>
        <Input value={note} onChangeText={setNote} placeholder={t('money.note')} accessibilityLabel={t('money.note')} multiline maxLength={500} />
      </Ask>
    </Screen>
  );
}

/** Big amounts read back in Indian grouping (₹5,00,000), so a missing zero is seen before saving. */
function AmountEcho({ paise }: { paise: number }) {
  return <Banner tone="ok" text={formatPaise(paise)} />;
}
