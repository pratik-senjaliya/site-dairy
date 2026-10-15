import { useState } from 'react';
import { QtyField, RowChips } from '../components/pickers';
import { Button, Card, Empty, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';

// Site-to-site transfer: the sending site records it, the receiving site confirms it arrived.
export default function Transfer() {
  const t = useT();
  const name = useName();
  const { me } = useSession();
  const { siteId } = useSite();
  const materials = useDb(() => db.rows('material'));
  const projects = useDb(() => db.rows('project').filter((p) => p.id !== siteId && p.status === 'active'));
  const incoming = useDb(() => db.rows('stockTransfer').filter((r) => r.toProjectId === siteId && r.status === 'sent'));
  const outgoing = useDb(() => db.rows('stockTransfer').filter((r) => r.fromProjectId === siteId).slice(-5));
  const [to, setTo] = useState<string | null>(null);
  const [materialId, setMaterial] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const unit = String(materials.find((m) => m.id === materialId)?.unit ?? '');
  const siteName = (id: unknown) => me?.projects.find((p) => p.id === id)?.name ?? String(db.find('project', id as string)?.name ?? '');

  return (
    <Screen title={t('home.transfers')}>
      <T.h2>{t('transfer.incoming')}</T.h2>
      {incoming.length ? incoming.map((r) => (
        <Card key={r.id}>
          <T.body bold>{name(materials.find((m) => m.id === r.materialId))} · {String(r.qty)} · {t('transfer.from', { site: siteName(r.fromProjectId) })}</T.body>
          <Button small label={t('transfer.received')} onPress={() => { db.save('stockTransfer', { ...r, status: 'received' }); notice(t('common.saved')); }} />
        </Card>
      )) : <Empty text={t('transfer.noneIncoming')} />}
      <Card>
        <T.h2>{t('transfer.send')}</T.h2>
        <RowChips label={t('transfer.toSite')} rows={projects} value={to} onChange={setTo} nameOf={(p) => String(p.name)} />
        <RowChips label={t('report.material')} rows={materials} value={materialId} onChange={setMaterial} nameOf={name} />
        {materialId ? <QtyField label={t('report.qty')} unit={unit} value={qty} onChange={setQty} /> : null}
        <Button label={t('transfer.send')} disabled={!to || !materialId || !qty} onPress={() => {
          db.save('stockTransfer', { fromProjectId: siteId, toProjectId: to, materialId, qty, status: 'sent' });
          setQty(0);
          notice(t('common.saved'));
        }} />
      </Card>
      {outgoing.map((r) => <T.small key={r.id}>→ {siteName(r.toProjectId)} · {name(materials.find((m) => m.id === r.materialId))} {String(r.qty)} · {t(`status.${String(r.status)}` as 'status.sent')}</T.small>)}
    </Screen>
  );
}
