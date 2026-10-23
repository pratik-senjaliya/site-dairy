import { router } from 'expo-router';
import { Card, flush, ListRow, Screen, Section } from '../../components/ui';
import { db, useDb } from '../../lib/db';
import { useCan, useOnline } from '../../lib/hooks';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';

const DAY_KEYS = ['day.0', 'day.1', 'day.2', 'day.3', 'day.4', 'day.5', 'day.6'] as const;

// Everything a builder sets up, from the phone: sites and floors, staff, contractors with rates, suppliers,
// minimum stock and the company's wage day. (The office web panel does the same for those who use it.)
export default function Setup() {
  const t = useT();
  const can = useCan();
  const { me } = useSession();
  const role = me?.user.role;
  const owner = role === 'owner';
  const people = useOnline<{ id: string }[]>(owner ? '/users' : null);
  const counts = useDb(() => ({
    contractors: db.rows('contractor').length,
    suppliers: db.rows('supplier').length,
    floors: (id: string) => db.rows('structureNode').filter((n) => n.projectId === id && n.kind === 'floor').length,
  }));
  const sites = me?.projects ?? [];
  const settings = me?.company.settings;

  return (
    <Screen title={t('setup.title')} subtitle={me?.company.name}>
      {can('projects', 'C') ? (
        <>
          <Section title={t('setup.sites')} action={`+ ${t('common.add')}`} onAction={() => router.push('/setup/site')} />
          <Card style={flush}>
            {sites.map((p) => (
              <ListRow key={p.id} icon="office-building-outline" title={p.name} detail={`${t(`projectStatus.${p.status}` as 'projectStatus.active')} · ${t('setup.floorsCount', { count: counts.floors(p.id) })}`} onPress={() => router.push({ pathname: '/setup/site', params: { id: p.id } })} />
            ))}
            <ListRow icon="plus" tone="ok" title={t('setup.addSite')} onPress={() => router.push('/setup/site')} last />
          </Card>
        </>
      ) : null}

      <Section title={t('home.more')} />
      <Card style={flush}>
        {owner ? <ListRow icon="account-group-outline" title={t('setup.people')} detail={people.data ? t('setup.peopleCount', { count: people.data.length }) : undefined} onPress={() => router.push('/setup/people')} /> : null}
        {/* Who may change each list follows the server's rules (masters WRITERS). */}
        {owner || role === 'engineer' ? <ListRow icon="account-hard-hat-outline" title={t('setup.contractors')} detail={t('setup.contractorsCount', { count: counts.contractors })} onPress={() => router.push('/setup/contractors')} /> : null}
        {owner || role === 'engineer' || role === 'store' ? <ListRow icon="truck-outline" title={t('setup.suppliers')} detail={t('setup.suppliersCount', { count: counts.suppliers })} onPress={() => router.push('/setup/suppliers')} /> : null}
        {owner || role === 'store' ? <ListRow icon="warehouse" title={t('setup.minStock')} detail={t('setup.minStockHint')} onPress={() => router.push('/setup/stock')} /> : null}
        {owner && settings ? (
          <ListRow icon="calendar-week" title={t('setup.company')} detail={`${t(DAY_KEYS[settings.wageDay]!)} · ${settings.reportTime}`} onPress={() => router.push('/setup/company')} last />
        ) : null}
      </Card>
    </Screen>
  );
}
