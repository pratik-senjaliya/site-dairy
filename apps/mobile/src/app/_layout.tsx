import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { db, useDb } from '../lib/db';
import { SessionProvider, useSession } from '../lib/session';

function AutoSync() {
  const { status, me, refreshMe } = useSession();
  useEffect(() => (status === 'in' ? db.startAutoSync() : undefined), [status]);
  // Sites added or removed by the owner: refresh the site list the app shows.
  const sites = useDb(() => db.sites.slice().sort().join());
  useEffect(() => {
    const mine = me?.projects.map((p) => p.id).sort().join();
    if (status === 'in' && sites && mine !== undefined && sites !== mine) void refreshMe().catch(() => {});
  }, [sites, status, me, refreshMe]);
  return null;
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
