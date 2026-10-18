import type { Locale } from '@site-diary/i18n';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Banner, Button, Card, Chips, Field, Screen, T } from '../components/ui';
import { getServer, isDemo } from '../lib/api';
import { kv } from '../lib/kv';
import { confirm } from '../lib/hooks';
import { db } from '../lib/db';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { resetDemo } from '../demo/server';

// M17
export default function Profile() {
  const t = useT();
  const { me, lang, setLang, signOut } = useSession();
  return (
    <Screen title={t('home.profile')}>
      <Card>
        <T.h2>{me?.user.name}</T.h2>
        <T.body muted>{me?.user.phone} · {t(`role.${me?.user.role ?? 'supervisor'}` as 'role.owner')}</T.body>
        <T.body muted>{me?.company.name}</T.body>
      </Card>
      <Field label={t('profile.language')}>
        <Chips<Locale> options={[{ value: 'gu', label: 'ગુજરાતી' }, { value: 'hi', label: 'हिन्दी' }, { value: 'en', label: 'English' }]} value={lang} onChange={setLang} />
      </Field>
      {(me?.projects.length ?? 0) > 1 ? <Button kind="secondary" label={t('home.changeSite')} onPress={() => router.push('/sites')} /> : null}
      <Button kind="secondary" label={t('sync.title')} onPress={() => router.push('/sync')} />
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
      <Button kind="danger" label={t('profile.signOut')} onPress={() => void (async () => {
        const waiting = db.outboxCount + db.photos.length;
        if (waiting && !(await confirm(t('profile.signOut'), t('profile.unsentWarning', { count: waiting }), t('profile.signOut'), t('common.cancel')))) return;
        await signOut();
        router.replace('/login');
      })()} />
      <T.small>{t('login.server')}: {getServer()} · v{Constants.expoConfig?.version ?? '1.0.0'}</T.small>
    </Screen>
  );
}
