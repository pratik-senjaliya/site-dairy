import { router } from 'expo-router';
import { Button, Empty, Screen } from '../components/ui';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';

// M2: remembers the last site.
export default function Sites() {
  const t = useT();
  const { me, siteId, setSite, signOut } = useSession();
  const projects = me?.projects.filter((p) => p.status === 'active') ?? [];
  return (
    <Screen title={t('site.pick')} back={!!siteId}>
      {projects.length ? (
        projects.map((p) => (
          <Button key={p.id} kind={p.id === siteId ? 'primary' : 'secondary'} label={p.name} onPress={() => { setSite(p.id); router.replace('/home'); }} />
        ))
      ) : (
        <>
          <Empty text={t('site.none')} />
          <Button kind="secondary" label={t('profile.signOut')} onPress={() => void signOut().then(() => router.replace('/login'))} />
        </>
      )}
    </Screen>
  );
}
