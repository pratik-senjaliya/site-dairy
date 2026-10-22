import { formatNumber, isoDate } from '@site-diary/shared';
import { useState } from 'react';
import { byUse, QtyField, RowChips, useMaterials } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Ask, Banner, Button, DiaryLine, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { floorName } from '../lib/structure';

// M7: material used, asked as the diary would: which material, how much, and where it went (work and floor).
export default function Used() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const materials = useMaterials();
  // Work items in template order, the ones this site works on now first.
  const items = useDb(() => byUse(
    db.rows('workItem').filter((w) => w.projectId === siteId).sort((a, b) => Number(a.sort) - Number(b.sort)),
    [...db.rows('dailyProgress'), ...db.rows('materialIssue')].filter((r) => r.projectId === siteId).map((r) => r.workItemId),
  ));
  const floors = useDb(() => db.rows('structureNode').filter((n) => n.projectId === siteId && n.kind === 'floor').sort((a, b) => Number(a.sort) - Number(b.sort)));
  const stock = useDb(() => db.stock);
  const [materialId, setMaterial] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const [workItemId, setItem] = useState<string | null>(null);
  const [nodeId, setNode] = useState<string | null>(null);
  const [fromLast, setFromLast] = useState(false);
  const material = materials.find((m) => m.id === materialId);
  const unit = String(material?.unit ?? '');
  const onHand = stock.find((s) => s.projectId === siteId && s.materialId === materialId)?.qty;

  const line = (r: Record<string, unknown>) => {
    const m = db.find('material', r.materialId as string);
    const item = r.workItemId ? name(db.find('workItem', r.workItemId as string)) : '';
    const node = r.structureNodeId ? db.find('structureNode', r.structureNodeId as string) : undefined;
    const floor = node ? floorName(node) : '';
    const where = item && floor ? t('used.whereBoth', { item, floor }) : item ? t('used.whereItem', { item }) : floor ? t('used.whereFloor', { floor }) : '';
    return t('used.line', { material: name(m), qty: formatNumber(Number(r.qty)), unit: String(m?.unit ?? ''), where });
  };
  const today = useDb(() => db.rows('materialIssue').filter((r) => r.projectId === siteId && r.date === isoDate()).map((r) => ({ id: r.id, table: 'materialIssue' as const, label: line(r) })));

  // The same material usually goes to the same work and floor as last time: start from that entry.
  const pickMaterial = (id: string | null) => {
    setMaterial(id);
    const last = db.rows('materialIssue').filter((r) => r.projectId === siteId && r.materialId === id).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    setFromLast(!!last);
    setQty(last ? Number(last.qty) : 0);
    setItem((last?.workItemId as string | null) ?? null);
    setNode((last?.structureNodeId as string | null) ?? null);
  };

  return (
    <Screen
      title={t('home.materialUsed')}
      footer={
        <>
          {materialId && qty ? <DiaryLine text={line({ materialId, qty, workItemId, structureNodeId: nodeId })} /> : null}
          <Button label={t('common.save')} disabled={!materialId || !qty} onPress={() => {
            db.save('materialIssue', { projectId: siteId, materialId, qty, workItemId, structureNodeId: nodeId, date: isoDate() });
            notice(t('common.saved'));
            done();
          }} />
        </>
      }
    >
      <Ask q={t('used.qWhich')}>
        <RowChips label="" rows={materials} max={8} value={materialId} onChange={pickMaterial} nameOf={name} />
      </Ask>
      {material ? (
        <>
          {fromLast ? <Banner tone="info" text={t('used.fromLast')} /> : null}
          <Ask q={t('used.qHowMuch')} hint={onHand !== undefined ? t('used.inStock', { qty: formatNumber(onHand), unit }) : undefined}>
            <QtyField label="" unit={unit} value={qty} onChange={setQty} />
          </Ask>
          {onHand !== undefined && qty > onHand ? <Banner text={t('used.moreThanStock', { qty: onHand })} /> : null}
          <Ask q={t('used.qWhere')} hint={t('used.whereHint')} optional>
            <T.body bold>{t('used.inWork')}</T.body>
            <RowChips label="" rows={items} max={8} value={workItemId} onChange={setItem} nameOf={name} allowNone noneLabel={t('common.notSure')} />
            <T.body bold>{t('used.onFloor')}</T.body>
            <RowChips label="" rows={floors} value={nodeId} onChange={setNode} nameOf={(r) => floorName(r)} allowNone noneLabel={t('common.notSure')} />
          </Ask>
        </>
      ) : null}
      <TodayEntries entries={today} />
    </Screen>
  );
}
