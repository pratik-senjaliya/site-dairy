import { formatNumber, isoDate } from '@site-diary/shared';
import { useState } from 'react';
import { byUse, QtyField, QuickAdd, RowChips, useMaterials } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Ask, Banner, Button, DiaryLine, Screen, T } from '../components/ui';
import { post } from '../lib/api';
import { db, useDb } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { floorName } from '../lib/structure';
import { useDiary } from '../lib/diary';

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
  // Fixing a mistake: the entry goes back into the form and is saved again under the same id.
  const [editId, setEditId] = useState<string | null>(null);
  const edit = (id: string) => {
    const r = db.find('materialIssue', id);
    if (!r) return;
    setEditId(id);
    setFromLast(false);
    setMaterial(String(r.materialId));
    setQty(Number(r.qty));
    setItem((r.workItemId as string | null) ?? null);
    setNode((r.structureNodeId as string | null) ?? null);
  };
  // What is on site comes first, with how much is there; the rest follow (stock can lag a sync).
  const qtyAt = (materialId: string) => stock.find((x) => x.projectId === siteId && x.materialId === materialId)?.qty ?? 0;
  const onSite = [...materials.filter((m) => qtyAt(m.id) > 0), ...materials.filter((m) => qtyAt(m.id) <= 0)];
  const material = materials.find((m) => m.id === materialId);
  const unit = String(material?.unit ?? '');
  const onHand = stock.find((s) => s.projectId === siteId && s.materialId === materialId)?.qty;

  const line = useDiary().used;
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
          <Button label={editId ? t('common.saveChange') : t('common.save')} disabled={!materialId || !qty} onPress={() => {
            db.save('materialIssue', { ...(editId && { id: editId, date: String(db.find('materialIssue', editId)?.date ?? isoDate()) }), projectId: siteId, materialId, qty, workItemId, structureNodeId: nodeId, ...(!editId && { date: isoDate() }) });
            notice(t('common.saved'));
            done();
          }} />
        </>
      }
    >
      {editId ? <Banner tone="info" text={t('common.editingHint')} onPress={() => { setEditId(null); setMaterial(null); setQty(0); }} /> : null}
      <Ask q={t('used.qWhich')}>
        <RowChips label="" rows={onSite} max={8} value={materialId} onChange={pickMaterial} nameOf={(m) => { const q = qtyAt(m.id); return q > 0 ? `${name(m)} · ${formatNumber(q)} ${String(m.unit ?? '')}` : name(m); }} />
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
            <QuickAdd label={t('progress.newItem')} placeholder="Waterproofing" onAdd={async (n) => {
              const w = await post<{ id: string }>('/masters/workItem', { projectId: siteId, nameGu: n, nameEn: n, sort: items.length });
              await db.sync();
              setItem(w.id);
            }} />
            <T.body bold>{t('used.onFloor')}</T.body>
            <RowChips label="" rows={floors} value={nodeId} onChange={setNode} nameOf={(r) => floorName(r)} allowNone noneLabel={t('common.notSure')} />
            <QuickAdd label={t('progress.newPlace')} placeholder="Terrace" onAdd={async (n) => {
              const tower = db.rows('structureNode').find((x) => x.projectId === siteId && x.kind === 'tower');
              const f = await post<{ id: string }>('/masters/structureNode', { projectId: siteId, parentId: tower?.id ?? null, kind: 'floor', name: n, sort: floors.length + 100 });
              await db.sync();
              setNode(f.id);
            }} />
          </Ask>
        </>
      ) : null}
      <TodayEntries entries={today} editing={editId} onEdit={edit} />
    </Screen>
  );
}
