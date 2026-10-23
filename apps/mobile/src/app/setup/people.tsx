import { router } from 'expo-router';
import { Banner, Button, Card, Empty, flush, ListRow, Screen } from '../../components/ui';
import { useOnline } from '../../lib/hooks';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import type { Person } from '../../lib/setup';

// Staff: who can log in, as what, on which sites. Tap to change; add invites by phone number.
export default function People() {
  const t = useT();
  const { me } = useSession();
  const { data, error, reload } = useOnline<Person[]>('/users');
  const siteNames = (ids: string[]) => ids.map((id) => me?.projects.find((p) => p.id === id)?.name).filter(Boolean).join(', ');
  return (
    <Screen title={t('setup.people')} footer={<Button icon="account-plus-outline" label={t('setup.addPerson')} onPress={() => router.push('/setup/person')} />}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('setup.needsOnline') : error} onPress={() => void reload()} /> : null}
      {data && data.length <= 1 ? <Empty icon="account-group-outline" text={t('setup.noTeam')} /> : null}
      {data?.length ? (
        <Card style={flush}>
          {data.map((p, i) => (
            <ListRow
              key={p.id}
              icon={p.role === 'owner' ? 'crown-outline' : 'account-outline'}
              tone={p.isActive ? 'primary' : 'muted'}
              title={p.name}
              detail={[t(`role.${p.role}` as 'role.owner'), p.role === 'owner' || p.role === 'accountant' ? t('setup.allSites') : siteNames(p.siteIds), p.isActive ? '' : t('setup.stopped')].filter(Boolean).join(' · ')}
              onPress={p.id === me?.user.id ? undefined : () => router.push({ pathname: '/setup/person', params: { id: p.id } })}
              last={i === data.length - 1}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
