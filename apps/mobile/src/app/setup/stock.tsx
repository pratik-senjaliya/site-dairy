import { formatNumber } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chips, Input, Row, Screen, T } from '../../components/ui';
import { del, patch, post } from '../../lib/api';
import { db, useDb } from '../../lib/db';
import { useSite } from '../../lib/hooks';
import { useName, useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { useSave } from '../../lib/setup';

// Minimum stock per site and material: below it the store keeper, engineer and owner are warned.
export default function MinStock() {
  const t = useT();
  const name = useName();
  const { me } = useSession();
  const { siteId: current } = useSite();
  const { busy, run } = useSave();
  const [site, setSite] = useState<string | null>(current ?? me?.projects[0]?.id ?? null);
  const materials = useDb(() => db.rows('material').slice().sort((a, b) => name(a).localeCompare(name(b))));
  const settings = useDb(() => db.rows('siteMaterialSetting').filter((s) => s.projectId === site));
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setValues(Object.fromEntries(settings.map((s) => [String(s.materialId), formatNumber(Number(s.minStock)).replace(/,/g, '')])));
    // Only when the site changes or the list arrives, not on every keystroke.
  }, [site, settings.length]);

  const save = () => void run(async () => {
    for (const m of materials) {
      const raw = values[m.id] ?? '';
      const qty = Number(raw.replace(/[^\d.]/g, ''));
      const was = settings.find((s) => s.materialId === m.id);
      if (!raw.trim() || !qty) {
        if (was) await del(`/masters/siteMaterialSetting/${was.id}`);
        continue;
      }
      if (was && Number(was.minStock) === qty) continue;
      const body = { projectId: site, materialId: m.id, minStock: qty };
      if (was) await patch(`/masters/siteMaterialSetting/${was.id}`, body);
      else await post('/masters/siteMaterialSetting', body);
    }
    router.back();
  });

  return (
    <Screen title={t('setup.minStock')} subtitle={t('setup.minStockHint')} footer={<Button label={t('common.save')} icon="check" busy={busy} disabled={!site} onPress={save} />}>
      {(me?.projects.length ?? 0) > 1 ? (
        <Chips options={(me?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))} value={site} onChange={setSite} />
      ) : null}
      <Card style={{ gap: spacing.sm }}>
        {materials.map((m) => (
          <Row key={m.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><T.body bold>{name(m)}</T.body></View>
            <Input
              value={values[m.id] ?? ''}
              onChangeText={(v) => setValues((x) => ({ ...x, [m.id]: v.replace(/[^\d.]/g, '') }))}
              keyboardType="decimal-pad"
              placeholder="—"
              accessibilityLabel={name(m)}
              style={{ width: 96, textAlign: 'right', fontSize: 18, fontWeight: '700' }}
            />
            <View style={{ width: 52 }}><T.small>{String(m.unit)}</T.small></View>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
