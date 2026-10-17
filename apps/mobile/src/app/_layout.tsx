import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '../components/ui';
import { db, useDb } from '../lib/db';
import { registerPush } from '../lib/push';
import { catchGlobalErrors, reportError } from '../lib/report-error';
import { SessionProvider, useSession } from '../lib/session';

function AutoSync() {
  const { status, me, refreshMe } = useSession();
  useEffect(() => (status === 'in' ? db.startAutoSync() : undefined), [status]);
  useEffect(() => {
    if (status !== 'in') return;
    let stop = () => {};
    void registerPush().then((s) => (stop = s));
    return () => stop();
  }, [status]);
  // Sites added or removed by the owner: refresh the site list the app shows.
  const sites = useDb(() => db.sites.slice().sort().join());
  useEffect(() => {
    const mine = me?.projects.map((p) => p.id).sort().join();
    if (status === 'in' && sites && mine !== undefined && sites !== mine) void refreshMe().catch(() => {});
  }, [sites, status, me, refreshMe]);
  return null;
}

catchGlobalErrors();

/** A screen that crashes shows this instead of a white screen; entries already saved stay on the phone. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { lang } = useSessionSafe();
  useEffect(() => reportError(error), [error]);
  const text = ({
    gu: ['કંઈક ખોટું થયું', 'તમારી એન્ટ્રી ફોનમાં સુરક્ષિત છે.', 'હોમ પર જાઓ', 'ફરી પ્રયત્ન'],
    hi: ['कुछ गड़बड़ हुई', 'आपकी एंट्री फोन में सुरक्षित हैं।', 'होम पर जाएँ', 'फिर कोशिश'],
    en: ['Something went wrong', 'Your entries are safe on this phone.', 'Go to home', 'Try again'],
  } as const)[lang];
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{text[0]}</Text>
      <Text style={{ fontSize: 16, color: colors.muted }}>{text[1]}</Text>
      <Button label={text[3]} onPress={() => void retry()} />
      <Button kind="secondary" label={text[2]} onPress={() => router.replace('/')} />
    </View>
  );
}

function useSessionSafe(): { lang: 'gu' | 'hi' | 'en' } {
  try {
    return useSession();
  } catch {
    return { lang: 'gu' };
  }
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AutoSync />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        <StatusBar style="dark" />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
