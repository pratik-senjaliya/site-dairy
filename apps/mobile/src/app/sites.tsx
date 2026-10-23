import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Empty, flush, ListRow, Screen } from '../components/ui';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';

// M2: pick the site to work on (remembered). Nobody is left on an empty screen: staff not yet on a site
// can check again or sign out; the owner goes to add his first site.
export default function Sites() {
  const t = useT();
  const { me, siteId, setSite, signOut, refreshMe } = useSession();
  const [busy, setBusy] = useState(false);
  const projects = me?.projects.filter((p) => p.status === 'active') ?? [];
  const owner = me?.user.role === 'owner';
  return (
    <Screen title={t('site.pick')} subtitle={me?.company.name} back={!!siteId}>
      {projects.length ? (
        <Card style={flush}>
          {projects.map((p, i) => (
            <ListRow key={p.id} icon={p.id === siteId ? 'check-circle' : 'office-building-outline'} tone={p.id === siteId ? 'ok' : 'primary'} title={p.name} onPress={() => { setSite(p.id); router.replace('/home'); }} last={i === projects.length - 1} />
          ))}
        </Card>
      ) : owner ? (
        <Empty icon="office-building-outline" text={t('start.hint')} action={t('start.site')} onAction={() => router.push('/setup/site')} />
      ) : (
        <>
          <Empty icon="account-clock-outline" text={`${t('site.none')}\n${t('site.waiting')}`} />
          <Button icon="refresh" label={t('common.refresh')} busy={busy} onPress={() => { setBusy(true); void refreshMe().finally(() => setBusy(false)); }} />
          <Button kind="secondary" icon="logout" label={t('profile.signOut')} onPress={() => void signOut().then(() => router.replace('/login'))} />
        </>
      )}
    </Screen>
  );
}
