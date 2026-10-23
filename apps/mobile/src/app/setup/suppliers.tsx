import { useState } from 'react';
import { Ask, Button, Card, Empty, flush, Input, ListRow, Row, Screen, Section } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { db, useDb } from '../../lib/db';
import { useT } from '../../lib/i18n';
import { useSave } from '../../lib/setup';

// Suppliers: a name (and number) is all the gate needs; rates and GST are in the office's ledger.
export default function Suppliers() {
  const t = useT();
  const { busy, run } = useSave();
  const list = useDb(() => db.rows('supplier').slice().sort((a, b) => String(a.name).localeCompare(String(b.name))));
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const digits = phone.replace(/\D/g, '').slice(-10);
  const ok = name.trim().length >= 2 && (!digits || digits.length === 10);
  const reset = () => {
    setEditing(null);
    setName('');
    setPhone('');
  };
  const save = () => void run(async () => {
    const body = { name: name.trim(), phone: digits || '' };
    if (editing) await patch(`/masters/supplier/${editing}`, body);
    else await post('/masters/supplier', body);
    reset();
  });
  return (
    <Screen title={t('setup.suppliers')}>
      <Card>
        <Ask q={t('setup.qSupplierName')}>
          <Input value={name} onChangeText={setName} placeholder="Umiya Cement Traders" accessibilityLabel={t('setup.qSupplierName')} />
        </Ask>
        <Ask q={t('setup.qPhone')} optional>
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98250 12345" maxLength={14} accessibilityLabel={t('setup.qPhone')} />
        </Ask>
        <Row>
          {editing ? <Button style={{ flex: 1 }} kind="secondary" label={t('common.cancel')} onPress={reset} /> : null}
          <Button style={{ flex: 1 }} icon={editing ? 'check' : 'plus'} label={editing ? t('common.save') : t('setup.addSupplier')} busy={busy} disabled={!ok} onPress={save} />
        </Row>
      </Card>
      {list.length ? (
        <>
          <Section title={t('setup.suppliersCount', { count: list.length })} />
          <Card style={flush}>
            {list.map((s, i) => (
              <ListRow
                key={s.id}
                icon="truck-outline"
                title={String(s.name)}
                detail={s.phone ? String(s.phone).replace('+91', '') : undefined}
                onPress={() => { setEditing(s.id); setName(String(s.name)); setPhone(String(s.phone ?? '').replace('+91', '')); }}
                last={i === list.length - 1}
              />
            ))}
          </Card>
        </>
      ) : <Empty icon="truck-outline" text={t('setup.addSupplier')} />}
    </Screen>
  );
}
