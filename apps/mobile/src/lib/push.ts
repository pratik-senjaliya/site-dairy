import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { post } from './api';

// Push needs an installed build with an EAS project id (Expo Go on Android has no push since SDK 53).
// Without one, the bell in the app still shows every notice.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const ROUTE: Record<string, string> = {
  approval_needed: '/approvals', approved: '/notifications', rejected: '/notifications', low_stock: '/stock',
  nightly_report: '/reports', issue_assigned: '/issues', no_entry: '/attendance', late_edit: '/notifications', wages_due: '/notifications',
};

export async function registerPush(): Promise<() => void> {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (Platform.OS === 'web' || !projectId) return () => {};
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Site Diary', importance: Notifications.AndroidImportance.HIGH });
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') return () => {};
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await post('/auth/push-token', { token: data });
  } catch {
    // Expo Go or no network: the in-app bell still works
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const kind = (r.notification.request.content.data as { kind?: string } | undefined)?.kind;
    router.push((kind && ROUTE[kind]) || '/notifications');
  });
  return () => sub.remove();
}
