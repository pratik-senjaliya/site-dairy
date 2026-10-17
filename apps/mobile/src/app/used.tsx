import { isoDate } from '@site-diary/shared';
import { useState } from 'react';
import { QtyField, RowChips } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Banner, Button, Screen } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { floorName } from '../lib/structure';

// M7: material used → work item and floor.
export default function Used() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const materials = useDb(() => db.rows('material'));
  const items = useDb(() => db.rows('workItem').filter((w) => w.projectId === siteId).sort((a, b) => Number(a.sort) - Number(b.sort)));
  const floors = useDb(() => db.rows('structureNode').filter((n) => n.projectId === siteId && n.kind === 'floor').sort((a, b) => Number(a.sort) - Number(b.sort)));
  const stock = useDb(() => db.stock);
  const [materialId, setMaterial] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const [workItemId, setItem] = useState<string | null>(null);
  const [nodeId, setNode] = useState<string | null>(null);
  const material = materials.find((m) => m.id === materialId);
  const today = useDb(() => db.rows('materialIssue').filter((r) => r.projectId === siteId && r.date === isoDate()).map((r) => ({
    id: r.id, table: 'materialIssue' as const,
    label: `${name(db.find('material', r.materialId as string))} ${String(r.qty)} ${String(db.find('material', r.materialId as string)?.unit ?? '')}`,
    sub: [name(db.find('workItem', r.workItemId as string)), r.structureNodeId ? floorName(db.find('structureNode', r.structureNodeId as string) ?? { id: '', name: '' }) : ''].filter(Boolean).join(' · '),
  })));
  const onHand = stock.find((s) => s.projectId === siteId && s.materialId === materialId)?.qty;

  return (
    <Screen title={t('home.materialUsed')} footer={<Button label={t('common.save')} disabled={!materialId || !qty} onPress={() => {
      db.save('materialIssue', { projectId: siteId, materialId, qty, workItemId, structureNodeId: nodeId, date: isoDate() });
      notice(t('common.saved'));
      done();
    }} />}>
      <RowChips label={t('report.material')} rows={materials} value={materialId} onChange={setMaterial} nameOf={name} />
      {material ? <QtyField label={t('report.qty')} unit={String(material.unit)} value={qty} onChange={setQty} /> : null}
      {onHand !== undefined && qty > onHand ? <Banner text={t('used.moreThanStock', { qty: onHand })} /> : null}
      <RowChips label={t('report.workItem')} rows={items} value={workItemId} onChange={setItem} nameOf={name} allowNone />
      <RowChips label={t('report.floor')} rows={floors} value={nodeId} onChange={setNode} nameOf={(r) => floorName(r)} allowNone />
      <TodayEntries entries={today} />
    </Screen>
  );
}
