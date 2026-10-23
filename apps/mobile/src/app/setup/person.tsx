import type { Locale } from '@site-diary/i18n';
import { ROLES, type Role } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Ask, Button, Card, Chip, Chips, DiaryLine, IconBadge, Input, Screen, T } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { useOnline } from '../../lib/hooks';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { useSave, type Person as P } from '../../lib/setup';


const SITE_ROLES: Role[] = ['engineer', 'supervisor', 'store'];

// Add or change one person: name, number (they log in with it), what they handle, which sites.
// After adding, one tap tells them on WhatsApp.
export default function Person() {
  const t = useT();
  const { me } = useSession();
  const params = useLocalSearchParams<{ id?: string; site?: string; role?: string }>();
  const people = useOnline<P[]>(params.id ? '/users' : null);
  const { busy, run } = useSave();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>((params.role as Role | undefined) ?? 'supervisor');
  const [siteIds, setSiteIds] = useState<string[]>(params.site ? [params.site] : me?.projects.length === 1 ? [me.projects[0]!.id] : []);
  const [language, setLanguage] = useState<Locale>('gu');
  const [active, setActive] = useState(true);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const p = people.data?.find((x) => x.id === params.id);
    if (!p) return;
    setName(p.name);
    setPhone(p.phone.replace('+91', ''));
    setRole(p.role as Role);
    setSiteIds(p.siteIds);
    setLanguage(p.language as Locale);
    setActive(p.isActive);
  }, [people.data, params.id]);

  const needsSites = SITE_ROLES.includes(role);
  const digits = phone.replace(/\D/g, '').slice(-10);
  const ok = name.trim().length >= 2 && digits.length === 10 && (!needsSites || siteIds.length > 0);
  const sitesText = needsSites ? (me?.projects.filter((p) => siteIds.includes(p.id)).map((p) => p.name).join(', ') ?? '') : t('setup.allSites');
  const roleName = t(`role.${role}`);

  const save = () => void run(async () => {
    const body = { name: name.trim(), phone: digits, role, language, siteIds: needsSites ? siteIds : [], isActive: active };
    if (params.id) {
      await patch(`/users/${params.id}`, body);
      router.back();
    } else {
      await post('/users', body);
      setAdded(true);
    }
  });
  const invite = () => {
    const text = t('setup.inviteText', { name: name.trim().split(' ')[0] ?? name, company: me?.company.name ?? '', role: roleName, phone: digits });
    void Linking.openURL(`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`);
  };

  if (added) {
    return (
      <Screen title={t('setup.addPerson')} footer={<Button kind="secondary" label={t('common.done')} onPress={() => router.back()} />}>
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <IconBadge name="check" tone="ok" size={64} />
          <T.h2>{name.trim()} — {roleName}</T.h2>
          <T.body muted>{t('setup.phoneHint')} {digits}</T.body>
          <Button kind="success" icon="whatsapp" label={t('setup.invite')} onPress={invite} style={{ alignSelf: 'stretch' }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title={params.id ? name || t('setup.people') : t('setup.addPerson')}
      footer={
        <>
          {ok ? <DiaryLine text={t('setup.personWill', { name: name.trim(), role: roleName, sites: sitesText })} /> : null}
          <Button label={t('common.save')} icon="check" busy={busy} disabled={!ok} onPress={save} />
        </>
      }
    >
      <Ask q={t('setup.qPersonName')}>
        <Input value={name} onChangeText={setName} placeholder="Kanubhai Rathod" accessibilityLabel={t('setup.qPersonName')} autoFocus={!params.id} />
      </Ask>
      <Ask q={t('setup.qPhone')} hint={t('setup.phoneHint')}>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98250 12345" maxLength={14} accessibilityLabel={t('setup.qPhone')} style={{ fontSize: 20, letterSpacing: 1 }} />
      </Ask>
      <Ask q={t('setup.qRole')}>
        <View style={{ gap: spacing.sm }}>
          {ROLES.map((r) => (
            <Chip key={r} label={`${t(`role.${r}`)} — ${t(`roleHint.${r}`)}`} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </View>
      </Ask>
      {needsSites ? (
        <Ask q={t('setup.qSites')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {me?.projects.map((p) => (
              <Chip key={p.id} label={p.name} selected={siteIds.includes(p.id)} onPress={() => setSiteIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} />
            ))}
          </View>
          {!me?.projects.length ? <T.small color={colors.warning}>{t('start.site')}</T.small> : null}
        </Ask>
      ) : null}
      <Ask q={t('setup.qLanguage')}>
        <Chips<Locale> options={[{ value: 'gu', label: 'ગુજરાતી' }, { value: 'hi', label: 'हिन्दी' }, { value: 'en', label: 'English' }]} value={language} onChange={setLanguage} />
      </Ask>
      {params.id ? (
        <Ask q={t('setup.canLogin')}>
          <Chips options={[{ value: 'yes', label: t('setup.yes') }, { value: 'no', label: t('setup.no') }]} value={active ? 'yes' : 'no'} onChange={(v) => setActive(v === 'yes')} />
        </Ask>
      ) : null}
      {params.id ? <Button kind="ghost" icon="whatsapp" label={t('setup.invite')} onPress={invite} /> : null}
    </Screen>
  );
}
