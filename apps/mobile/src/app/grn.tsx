import { isoDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { byUse, QtyField, RowChips, TextField, useMaterials } from '../components/pickers';
import { TodayEntries } from '../components/TodayEntries';
import { Ask, Button, Card, Chip, DiaryLine, Row, Screen, T } from '../components/ui';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';
import { useDiary } from '../lib/diary';

type Line = { id: string; materialId: string; qty: number; rejectedQty: number };

// M6: material received, as the gate diary: who sent it, what and how much came, anything short or
// sent back, and the challan photo as proof.
export default function Grn() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const [grnId] = useState(randomUUID);
  const suppliers = useDb(() => byUse(db.rows('supplier'), db.rows('grn').map((g) => g.supplierId)));
  const materials = useMaterials();
  const pos = useDb(() => db.rows('purchaseOrder').filter((p) => p.projectId === siteId && ['approved', 'sent', 'partly_received'].includes(String(p.status))));
  const [photos, setPhotos] = useState<DbRow[]>([]);
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [poId, setPo] = useState<string | null>(null);
  const [challanNo, setChallan] = useState('');
  const [vehicleNo, setVehicle] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [current, setCurrent] = useState<Line>({ id: randomUUID(), materialId: '', qty: 0, rejectedQty: 0 });
  const [short, setShort] = useState(false);
  const unit = (id: string) => String(db.find('material', id)?.unit ?? '');

  const diary = useDiary();
  const itemText = diary.grnItem;
  const sentence = diary.grn;
  const today = useDb(() => {
    const day = isoDate();
    return db.rows('grn').filter((g) => g.projectId === siteId && g.date === day).map((g) => ({
      id: g.id, table: 'grn' as const,
      label: diary.grnRow(g),
      sub: [g.challanNo, g.vehicleNo].filter(Boolean).map(String).join(' · ') || undefined,
    }));
  });

  // Picking the supplier fills in what they usually bring, and how much (one tap to change).
  const pickSupplier = (id: string | null) => {
    setSupplier(id);
    if (!id || current.materialId || lines.length) return;
    const last = db.rows('grn').filter((g) => g.supplierId === id).sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .flatMap((g) => db.rows('grnLine').filter((l) => l.grnId === g.id))[0];
    if (last) setCurrent((c) => ({ ...c, materialId: String(last.materialId), qty: Number(last.qty) }));
  };

  const fresh = () => {
    setCurrent({ id: randomUUID(), materialId: '', qty: 0, rejectedQty: 0 });
    setShort(false);
  };
  const all = current.materialId && current.qty ? [...lines, current] : lines;

  const save = () => {
    if (!siteId || !all.length) return;
    db.save('grn', { id: grnId, projectId: siteId, supplierId, poId, challanNo: challanNo || null, vehicleNo: vehicleNo || null, date: isoDate(), note: null });
    for (const l of all) db.save('grnLine', { id: l.id, grnId, materialId: l.materialId, qty: l.qty, rejectedQty: l.rejectedQty, ratePaise: null });
    notice(t('common.saved'));
    done();
  };

  return (
    <Screen
      title={t('home.materialIn')}
      footer={
        <>
          {all.length ? <DiaryLine text={sentence(suppliers.find((x) => x.id === supplierId)?.name as string | undefined, all.map(itemText).join(', '))} /> : null}
          <Button label={t('common.save')} disabled={!all.length} onPress={save} />
        </>
      }
    >
      <Ask q={t('grn.qFrom')}>
        <RowChips label="" rows={suppliers} max={8} value={supplierId} onChange={pickSupplier} nameOf={(r) => String(r.name)} allowNone noneLabel={t('grn.noSupplier')} />
      </Ask>
      {pos.length ? <RowChips label={t('grn.po')} rows={pos.filter((p) => !supplierId || p.supplierId === supplierId)} value={poId} onChange={setPo} nameOf={(r) => String(r.poNo)} allowNone noneLabel={t('grn.noPo')} /> : null}

      {lines.length ? (
        <Card>
          <T.small>{t('grn.added')}</T.small>
          {lines.map((l) => (
            <Row key={l.id} style={{ justifyContent: 'space-between' }}>
              <T.body bold>{itemText(l)}</T.body>
              <Button kind="ghost" small label="✕" onPress={() => setLines((x) => x.filter((y) => y.id !== l.id))} />
            </Row>
          ))}
        </Card>
      ) : null}

      <Ask q={t('grn.qWhat')}>
        <RowChips label="" rows={materials} max={8} value={current.materialId || null} onChange={(id) => setCurrent((c) => ({ ...c, materialId: id ?? '' }))} nameOf={name} />
      </Ask>
      {current.materialId ? (
        <>
          <Ask q={t('grn.qHowMuch')}>
            <QtyField label="" unit={unit(current.materialId)} value={current.qty} onChange={(qty) => setCurrent((c) => ({ ...c, qty, rejectedQty: Math.min(c.rejectedQty, qty) }))} />
          </Ask>
          <Ask q={t('grn.qBad')}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip label={t('grn.allGood')} selected={!short} onPress={() => { setShort(false); setCurrent((c) => ({ ...c, rejectedQty: 0 })); }} />
              <Chip label={t('grn.someBad')} selected={short} onPress={() => setShort(true)} />
            </View>
            {short ? <QtyField label="" unit={unit(current.materialId)} value={current.rejectedQty} onChange={(rejectedQty) => setCurrent((c) => ({ ...c, rejectedQty: Math.min(rejectedQty, c.qty) }))} /> : null}
          </Ask>
          <Button kind="secondary" small label={t('grn.addAnother')} disabled={!current.qty} onPress={() => { setLines((l) => [...l, current]); fresh(); }} />
        </>
      ) : null}

      <Ask q={t('grn.qProof')} hint={t('grn.proofHint')} optional>
        <Row style={{ flexWrap: 'wrap' }}>
          {photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
          <Button kind="secondary" small label={photos.length ? t('photo.another') : t('grn.challanPhoto')} onPress={() => void takePhoto(siteId!, 'grn', grnId).then((p) => p && setPhotos((x) => [...x, p]))} />
        </Row>
        <Row style={{ gap: spacing.md }}>
          <View style={{ flex: 1 }}><TextField label={t('report.challan')} value={challanNo} onChange={setChallan} /></View>
          <View style={{ flex: 1 }}><TextField label={t('grn.vehicle')} value={vehicleNo} onChange={(v) => setVehicle(v.toUpperCase())} placeholder="GJ01 AB 1234" /></View>
        </Row>
      </Ask>
      <TodayEntries entries={today} />
    </Screen>
  );
}
