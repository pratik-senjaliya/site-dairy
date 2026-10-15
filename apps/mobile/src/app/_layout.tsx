import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { db } from '../lib/db';
import { SessionProvider, useSession } from '../lib/session';

function AutoSync() {
  const { status } = useSession();
  useEffect(() => (status === 'in' ? db.startAutoSync() : undefined), [status]);
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
