import { colors } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { db, useDb } from '../lib/db';
import { useT } from '../lib/i18n';

/** "Never lose an entry": always shows whether everything has reached the office. */
export function SyncBadge() {
  const t = useT();
  const state = useDb(() => ({ waiting: db.outboxCount + db.photos.length, syncing: db.syncing, offline: !db.online || db.lastError === 'offline', errors: db.errors.length }));
  const tone = state.waiting ? colors.warning : colors.success;
  const label = state.syncing ? t('sync.syncing') : state.offline ? `${t('common.offline')}${state.waiting ? ` · ${state.waiting}` : ''}` : state.waiting ? t('common.syncPending', { count: state.waiting }) : t('sync.allSent');
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/sync')} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: tone }}>
      <Text style={{ color: tone, fontWeight: '700', fontSize: 13 }}>{state.offline ? '⚠ ' : state.waiting ? '↑ ' : '✓ '}{label}</Text>
    </Pressable>
  );
}
