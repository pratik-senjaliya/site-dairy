import type { Locale } from '@site-diary/i18n';
import { colors, spacing, type } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Card, Chips, Field, Input, T } from '../components/ui';
import { ApiError, getDeviceId, getServer, post, setServer } from '../lib/api';
import { notice } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';

type Verify = { accessToken?: string; refreshToken?: string; signup?: boolean; verifiedToken?: string; companies?: { id: string; name: string; role: string }[] };

// M1: phone + OTP, language first. Unknown numbers can start a new company (owner).
export default function Login() {
  const t = useT();
  const { lang, setLang, signedIn } = useSession();
  const [step, setStep] = useState<'phone' | 'otp' | 'company' | 'signup'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<Verify | null>(null);
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [server, setServerText] = useState<string | null>(null);
  const device = { deviceId: getDeviceId(), deviceName: Platform.OS };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'offline' ? t('login.noServer') : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const finish = async (tokens: Verify) => {
    await signedIn(tokens);
    router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 34, fontWeight: '800', color: colors.primary }}>{t('app.name')}</Text>
            <T.body muted>{t('login.tagline')}</T.body>
          </View>
          <Chips<Locale> options={[{ value: 'gu', label: 'ગુજરાતી' }, { value: 'hi', label: 'हिन्दी' }, { value: 'en', label: 'English' }]} value={lang} onChange={setLang} />
          {error ? <Banner tone="error" text={error} /> : null}

          {step === 'phone' && (
            <Card>
              <Field label={t('auth.phone')}>
                <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98250 12345" autoFocus maxLength={14} style={{ fontSize: 22, letterSpacing: 1 }} />
              </Field>
              <Button label={t('auth.sendOtp')} busy={busy} disabled={phone.replace(/\D/g, '').length < 10} onPress={() => run(async () => {
                await post('/auth/otp/request', { phone });
                setStep('otp');
              })} />
            </Card>
          )}

          {step === 'otp' && (
            <Card>
              <T.body muted>{t('login.codeSent', { phone })}</T.body>
              <Field label={t('auth.enterOtp')}>
                <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoFocus maxLength={6} style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} textContentType="oneTimeCode" autoComplete="sms-otp" />
              </Field>
              <Button label={t('login.verify')} busy={busy} disabled={code.length !== 6} onPress={() => run(async () => {
                const r = await post<Verify>('/auth/otp/verify', { phone, code, ...device });
                if (r.accessToken) return finish(r);
                setVerified(r);
                setStep(r.signup ? 'signup' : 'company');
              })} />
              <Button kind="ghost" label={t('login.changeNumber')} onPress={() => { setStep('phone'); setCode(''); }} />
            </Card>
          )}

          {step === 'company' && verified?.companies && (
            <Card>
              <T.h2>{t('login.pickCompany')}</T.h2>
              {verified.companies.map((c) => (
                <Button key={c.id} kind="secondary" label={`${c.name} · ${t(`role.${c.role}` as 'role.owner')}`} busy={busy} onPress={() => run(async () => {
                  await finish(await post<Verify>('/auth/login', { verifiedToken: verified.verifiedToken, companyId: c.id, ...device }));
                })} />
              ))}
            </Card>
          )}

          {step === 'signup' && (
            <Card>
              <T.h2>{t('login.newCompany')}</T.h2>
              <T.body muted>{t('login.newCompanyHint')}</T.body>
              <Field label={t('login.companyName')}><Input value={company} onChangeText={setCompany} placeholder="Shree Ganesh Builders" /></Field>
              <Field label={t('login.yourName')}><Input value={name} onChangeText={setName} /></Field>
              <Button label={t('login.start')} busy={busy} disabled={company.trim().length < 2 || name.trim().length < 2} onPress={() => run(async () => {
                await finish(await post<Verify>('/auth/signup', { verifiedToken: verified?.verifiedToken, companyName: company, name, language: lang, ...device }));
              })} />
            </Card>
          )}

          <View style={{ gap: spacing.sm }}>
            {server === null ? (
              <Pressable onPress={() => setServerText(getServer())} hitSlop={8}>
                <Text style={{ color: colors.muted, fontSize: type.label, textAlign: 'center' }}>{t('login.server')}: {getServer()}</Text>
              </Pressable>
            ) : (
              <Card>
                <Field label={t('login.server')} hint={t('login.serverHint')}>
                  <Input value={server} onChangeText={setServerText} autoCapitalize="none" keyboardType="url" />
                </Field>
                <Button kind="secondary" small label={t('common.save')} onPress={() => void setServer(server).then(() => { setServerText(null); notice(t('login.server'), getServer()); })} />
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
