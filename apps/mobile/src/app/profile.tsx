import type { Locale } from '@site-diary/i18n';
import { spacing } from '@site-diary/ui-tokens';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Ask, Banner, Button, Card, Chips, flush, IconBadge, ListRow, Screen, T } from '../components/ui';
import { getServer, isDemo } from '../lib/api';
import { kv } from '../lib/kv';
import { confirm, useCan } from '../lib/hooks';
import { db } from '../lib/db';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { resetDemo } from '../demo/server';

// M17: who I am, my language, my sites, whether everything is sent, and sign out.
export default function Profile() {
  const t = useT();
  const can = useCan();
  const { me, lang, setLang, signOut } = useSession();
  const setup = me?.user.role === 'owner' || me?.user.role === 'store' || can('attendance', 'A');
  return (
    <Screen title={t('home.profile')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge name={me?.user.role === 'owner' ? 'crown-outline' : 'account-outline'} size={56} />
        <View style={{ flex: 1 }}>
          <T.h2>{me?.user.name}</T.h2>
          <T.small>{me?.user.phone.replace('+91', '')} · {t(`role.${me?.user.role ?? 'supervisor'}` as 'role.owner')}</T.small>
          <T.small>{me?.company.name}</T.small>
        </View>
      </Card>
      <Ask q={t('profile.language')}>
        <Chips<Locale> options={[{ value: 'gu', label: 'ગુજરાતી' }, { value: 'hi', label: 'हिन्दी' }, { value: 'en', label: 'English' }]} value={lang} onChange={setLang} />
      </Ask>
      <Card style={flush}>
        {(me?.projects.length ?? 0) > 1 ? <ListRow icon="swap-horizontal" title={t('home.changeSite')} onPress={() => router.push('/sites')} /> : null}
        {setup ? <ListRow icon="cog-outline" title={t('setup.title')} onPress={() => router.push('/setup')} /> : null}
        <ListRow icon="cloud-sync-outline" title={t('sync.title')} onPress={() => router.push('/sync')} last />
      </Card>
      {isDemo() ? (
        <>
          <Banner tone="info" text={t('demo.banner')} />
          <Button label={t('demo.switch')} onPress={() => void signOut().then(() => router.replace('/login'))} />
          <Button kind="secondary" label={t('demo.reset')} onPress={() => void (async () => {
            if (!(await confirm(t('demo.reset'), t('demo.resetConfirm'), t('demo.reset'), t('common.cancel')))) return;
            await signOut();
            await resetDemo();
            await kv.removePrefix('db:');
            await kv.removePrefix('demo:photo:');
            router.replace('/login');
          })()} />
        </>
      ) : null}
      <Button kind="secondary" icon="logout" label={t('profile.signOut')} onPress={() => void (async () => {
        const waiting = db.outboxCount + db.photos.length;
        if (waiting && !(await confirm(t('profile.signOut'), t('profile.unsentWarning', { count: waiting }), t('profile.signOut'), t('common.cancel')))) return;
        await signOut();
        router.replace('/login');
      })()} />
      <T.small>{t('login.server')}: {getServer()} · v{Constants.expoConfig?.version ?? '1.0.0'}</T.small>
    </Screen>
  );
}
