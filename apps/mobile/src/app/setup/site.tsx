import { PROJECT_TYPES } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ask, Banner, Button, Card, Chips, DiaryLine, flush, Input, ListRow, Row, Screen, Section, Stepper, T } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { useOnline } from '../../lib/hooks';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { useSave } from '../../lib/setup';

type Type = (typeof PROJECT_TYPES)[number];
type Status = 'active' | 'on_hold' | 'completed';
interface Detail {
  id: string; name: string; address: string | null; type: Type; status: Status;
  structure: { id: string; kind: string; name: string; parentId: string | null }[];
  team: { id: string; name: string; role: string; phone: string }[];
}

/** Floors of one wing: "A wing, ground + 7 floors". */
function Floors({ floors, setFloors, basements, setBasements }: { floors: number; setFloors: (n: number) => void; basements: number; setBasements: (n: number) => void }) {
  const t = useT();
  return (
    <>
      <Ask q={t('setup.qFloors')} hint={t('setup.floorsHint')}>
        <Stepper label={t('setup.qFloors')} value={floors} onChange={setFloors} max={80} />
      </Ask>
      <Ask q={t('setup.basements')} optional>
        <Stepper label={t('setup.basements')} value={basements} onChange={setBasements} max={5} />
      </Ask>
    </>
  );
}

// A site: name, where, what kind (that makes its list of work), and its floors — in one save. Opened again,
// it shows the wings and floors and who works there, with a wing or a person added from here.
export default function SiteSetup() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { refreshMe, setSite, siteId } = useSession();
  const { busy, run } = useSave();
  const detail = useOnline<Detail>(id ? `/projects/${id}` : null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<Type>('rcc_frame');
  const [status, setStatus] = useState<Status>('active');
  const [floors, setFloors] = useState(4);
  const [basements, setBasements] = useState(0);
  const [wing, setWing] = useState('');
  const [addingWing, setAddingWing] = useState(false);

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setName(d.name);
    setAddress(d.address ?? '');
    setType(d.type);
    setStatus(d.status);
  }, [detail.data]);

  const towers = detail.data?.structure.filter((n) => n.kind === 'tower') ?? [];
  const floorsOf = (towerId: string) => detail.data?.structure.filter((n) => n.parentId === towerId && n.kind === 'floor').length ?? 0;
  const types = PROJECT_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));
  const body = { name: name.trim(), address: address.trim() || null, type, status };

  const create = () => void run(async () => {
    const p = await post<{ id: string }>('/projects', body);
    if (floors || basements) await post(`/projects/${p.id}/structure/bulk`, { towerName: 'A', floors, basements, ground: true });
    await refreshMe();
    if (!siteId) setSite(p.id);
    router.replace({ pathname: '/setup/site', params: { id: p.id } });
  });
  const save = () => void run(async () => {
    await patch(`/projects/${id}`, body);
    await refreshMe();
    router.back();
  });
  const addWing = () => void run(async () => {
    await post(`/projects/${id}/structure/bulk`, { towerName: wing.trim() || String.fromCharCode(65 + towers.length), floors, basements, ground: true });
    setAddingWing(false);
    setWing('');
    await detail.reload();
  });

  return (
    <Screen
      title={id ? detail.data?.name ?? t('setup.sites') : t('setup.addSite')}
      footer={
        <>
          {!id && name.trim() ? <DiaryLine text={t('setup.siteWill', { name: name.trim(), type: t(`type.${type}`), floors })} /> : null}
          <Button label={id ? t('common.save') : t('setup.createSite')} icon="check" busy={busy} disabled={name.trim().length < 2} onPress={id ? save : create} />
        </>
      }
    >
      {detail.error ? <Banner tone="error" text={detail.error === 'offline' ? t('setup.needsOnline') : detail.error} onPress={() => void detail.reload()} /> : null}
      <Ask q={t('setup.qSiteName')}>
        <Input value={name} onChangeText={setName} placeholder={t('setup.siteNameHint')} accessibilityLabel={t('setup.qSiteName')} autoFocus={!id} />
      </Ask>
      <Ask q={t('setup.qAddress')} optional>
        <Input value={address} onChangeText={setAddress} placeholder="Nikol, Ahmedabad" accessibilityLabel={t('setup.qAddress')} />
      </Ask>
      <Ask q={t('setup.qType')} hint={id ? undefined : t('setup.typeHint')}>
        <Chips options={types} value={type} onChange={setType} />
      </Ask>
      {id ? (
        <Ask q={t('setup.qStatus')}>
          <Chips<Status> options={(['active', 'on_hold', 'completed'] as const).map((v) => ({ value: v, label: t(`projectStatus.${v}`) }))} value={status} onChange={setStatus} />
        </Ask>
      ) : <Floors floors={floors} setFloors={setFloors} basements={basements} setBasements={setBasements} />}

      {id && detail.data ? (
        <>
          <Section title={t('setup.wings')} />
          <Card style={flush}>
            {towers.length ? towers.map((w, i) => (
              <ListRow key={w.id} icon="office-building-outline" title={w.name} value={t('setup.floorsCount', { count: floorsOf(w.id) })} last={i === towers.length - 1 && !addingWing} />
            )) : <View style={{ padding: spacing.lg }}><T.body muted>{t('setup.noWings')}</T.body></View>}
          </Card>
          {addingWing ? (
            <Card>
              <Ask q={t('setup.wingName')}>
                <Input value={wing} onChangeText={setWing} placeholder={String.fromCharCode(65 + towers.length)} accessibilityLabel={t('setup.wingName')} />
              </Ask>
              <Floors floors={floors} setFloors={setFloors} basements={basements} setBasements={setBasements} />
              <Row>
                <Button style={{ flex: 1 }} kind="secondary" label={t('common.cancel')} onPress={() => setAddingWing(false)} />
                <Button style={{ flex: 1 }} label={t('common.add')} busy={busy} onPress={addWing} />
              </Row>
            </Card>
          ) : <Button kind="secondary" icon="plus" label={t('setup.addWing')} onPress={() => setAddingWing(true)} />}

          <Section title={t('setup.team')} action={`+ ${t('common.add')}`} onAction={() => router.push({ pathname: '/setup/person', params: { site: id } })} />
          <Card style={flush}>
            {detail.data.team.length ? detail.data.team.map((m, i) => (
              <ListRow key={m.id} icon="account-outline" title={m.name} detail={`${t(`role.${m.role}` as 'role.owner')} · ${m.phone.replace('+91', '')}`} onPress={() => router.push({ pathname: '/setup/person', params: { id: m.id } })} last={i === detail.data!.team.length - 1} />
            )) : (
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <T.body color={colors.warning}>{t('setup.noTeam')}</T.body>
                <Button small icon="account-plus-outline" label={t('start.people')} onPress={() => router.push({ pathname: '/setup/person', params: { site: id, role: 'supervisor' } })} />
              </View>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
