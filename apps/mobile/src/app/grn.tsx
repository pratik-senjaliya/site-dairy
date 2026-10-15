import { isoDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { QtyField, RowChips, TextField } from '../components/pickers';
import { Button, Card, Row, Screen, T } from '../components/ui';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { done, notice, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';

type Line = { id: string; materialId: string; qty: number; rejectedQty: number };

// M6: photo of the challan first, then supplier, material and quantity; shortage/rejection at the gate.
export default function Grn() {
  const t = useT();
  const name = useName();
  const { siteId } = useSite();
  const [grnId] = useState(randomUUID);
  const suppliers = useDb(() => db.rows('supplier'));
  const materials = useDb(() => db.rows('material'));
  const pos = useDb(() => db.rows('purchaseOrder').filter((p) => p.projectId === siteId && ['approved', 'sent', 'partly_received'].includes(String(p.status))));
  const [photos, setPhotos] = useState<DbRow[]>([]);
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [poId, setPo] = useState<string | null>(null);
  const [challanNo, setChallan] = useState('');
  const [vehicleNo, setVehicle] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [current, setCurrent] = useState<Line>({ id: randomUUID(), materialId: '', qty: 0, rejectedQty: 0 });
  const unit = (id: string) => String(materials.find((m) => m.id === id)?.unit ?? '');

  const addLine = () => {
    if (!current.materialId || !current.qty) return;
    setLines((l) => [...l, current]);
    setCurrent({ id: randomUUID(), materialId: '', qty: 0, rejectedQty: 0 });
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
    <Screen title={t('home.materialIn')} footer={<Button label={`${t('common.save')}${all.length ? ` · ${all.length}` : ''}`} disabled={!all.length} onPress={save} />}>
      <Card>
        <T.h2>{t('grn.challanPhoto')}</T.h2>
        <Row style={{ flexWrap: 'wrap' }}>
          {photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
          <Button kind="secondary" small label={photos.length ? t('photo.another') : t('photo.take')} onPress={() => void takePhoto(siteId!, 'grn', grnId).then((p) => p && setPhotos((x) => [...x, p]))} />
        </Row>
      </Card>
      <RowChips label={t('report.supplier')} rows={suppliers} value={supplierId} onChange={setSupplier} nameOf={(r) => String(r.name)} allowNone noneLabel={t('grn.noSupplier')} />
      {pos.length ? <RowChips label={t('grn.po')} rows={pos.filter((p) => !supplierId || p.supplierId === supplierId)} value={poId} onChange={setPo} nameOf={(r) => String(r.poNo)} allowNone noneLabel={t('grn.noPo')} /> : null}
      <Row style={{ gap: spacing.md }}>
        <View style={{ flex: 1 }}><TextField label={t('report.challan')} value={challanNo} onChange={setChallan} /></View>
        <View style={{ flex: 1 }}><TextField label={t('grn.vehicle')} value={vehicleNo} onChange={(v) => setVehicle(v.toUpperCase())} placeholder="GJ01 AB 1234" /></View>
      </Row>
      {lines.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T.body bold>{name(materials.find((m) => m.id === l.materialId))} · {l.qty} {unit(l.materialId)}{l.rejectedQty ? ` (−${l.rejectedQty})` : ''}</T.body>
            <Button kind="ghost" small label="✕" onPress={() => setLines((x) => x.filter((y) => y.id !== l.id))} />
          </Row>
        </Card>
      ))}
      <Card>
        <RowChips label={t('report.material')} rows={materials} value={current.materialId || null} onChange={(id) => setCurrent((c) => ({ ...c, materialId: id ?? '' }))} nameOf={name} />
        {current.materialId ? (
          <>
            <QtyField label={t('report.qty')} unit={unit(current.materialId)} value={current.qty} onChange={(qty) => setCurrent((c) => ({ ...c, qty }))} />
            <QtyField label={t('grn.rejected')} unit={unit(current.materialId)} value={current.rejectedQty} onChange={(rejectedQty) => setCurrent((c) => ({ ...c, rejectedQty: Math.min(rejectedQty, c.qty) }))} />
            <Button kind="secondary" small label={t('grn.addAnother')} disabled={!current.qty} onPress={addLine} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
