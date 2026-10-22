import { useState } from 'react';
import { QtyField, RowChips, useMaterials } from '../components/pickers';
import { Ask, Button, Card, DiaryLine, Empty, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useDiary } from '../lib/diary';

// Site-to-site transfer: what is on the way here comes first (confirm it arrived), then sending to another site.
export default function Transfer() {
  const t = useT();
  const name = useName();
  const { me } = useSession();
  const { siteId } = useSite();
  const materials = useMaterials();
  const projects = useDb(() => db.rows('project').filter((p) => p.id !== siteId && p.status === 'active'));
  const incoming = useDb(() => db.rows('stockTransfer').filter((r) => r.toProjectId === siteId && r.status === 'sent'));
  const outgoing = useDb(() => db.rows('stockTransfer').filter((r) => r.fromProjectId === siteId).slice(-5));
  const [to, setTo] = useState<string | null>(null);
  const [materialId, setMaterial] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const siteName = (id: unknown) => me?.projects.find((p) => p.id === id)?.name ?? String(db.find('project', id as string)?.name ?? '');
  const material = useDiary().material;
  const item = (r: Record<string, unknown>) => material(r.materialId, r.qty);
  const line = to && materialId && qty ? t('transfer.line', { site: siteName(to), item: item({ materialId, qty }) }) : null;

  return (
    <Screen title={t('home.transfers')}>
      <T.h2>{t('transfer.incoming')}</T.h2>
      {incoming.length ? incoming.map((r) => (
        <Card key={r.id}>
          <T.body bold>{item(r)} · {t('transfer.from', { site: siteName(r.fromProjectId) })}</T.body>
          <Button small label={t('transfer.received')} onPress={() => { db.save('stockTransfer', { ...r, status: 'received' }); notice(t('common.saved')); }} />
        </Card>
      )) : <Empty text={t('transfer.noneIncoming')} />}
      <Card>
        <T.h2>{t('transfer.send')}</T.h2>
        {projects.length ? (
          <>
            <Ask q={t('transfer.qTo')}>
              <RowChips label="" rows={projects} value={to} onChange={setTo} nameOf={(p) => String(p.name)} />
            </Ask>
            <Ask q={t('transfer.qWhat')}>
              <RowChips label="" rows={materials} max={8} value={materialId} onChange={setMaterial} nameOf={name} />
            </Ask>
            {materialId ? (
              <Ask q={t('indent.qHowMuch')}>
                <QtyField label="" unit={String(db.find('material', materialId)?.unit ?? '')} value={qty} onChange={setQty} />
              </Ask>
            ) : null}
            {line ? <DiaryLine text={line} /> : null}
            <Button label={t('transfer.send')} disabled={!line} onPress={() => {
              db.save('stockTransfer', { fromProjectId: siteId, toProjectId: to, materialId, qty, status: 'sent' });
              setQty(0);
              notice(t('common.saved'));
            }} />
          </>
        ) : <T.small>{t('transfer.noOtherSite')}</T.small>}
      </Card>
      {outgoing.map((r) => <T.small key={r.id}>→ {siteName(r.toProjectId)} · {item(r)} · {t(`status.${String(r.status)}` as 'status.sent')}</T.small>)}
    </Screen>
  );
}
