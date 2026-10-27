import { colors, radius } from '@site-diary/ui-tokens';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { db, useDb } from '../lib/db';
import { useT } from '../lib/i18n';
import { Icon, Text } from './ui';

/** "Never lose an entry": always shows whether everything has reached the office. */
export function SyncBadge() {
  const t = useT();
  const state = useDb(() => ({ waiting: db.outboxCount + db.photos.length, syncing: db.syncing, offline: !db.online || db.lastError === 'offline', errors: db.errors.length }));
  const tone = state.offline || state.waiting ? colors.warning : colors.success;
  const soft = state.offline || state.waiting ? colors.warningSoft : colors.successSoft;
  const label = state.syncing ? t('sync.syncing') : state.offline ? `${t('common.offline')}${state.waiting ? ` · ${state.waiting}` : ''}` : state.waiting ? t('common.syncPending', { count: state.waiting }) : t('sync.allSent');
  // All sent: just the green mark (its name is read out); otherwise say what is waiting.
  const quiet = !state.syncing && !state.offline && !state.waiting;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/sync')} hitSlop={8} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, borderRadius: radius.pill, backgroundColor: soft, marginRight: 4 }, quiet ? { width: 34 } : { paddingHorizontal: 10, maxWidth: 140 }]}>
      <Icon name={state.syncing ? 'sync' : state.offline ? 'wifi-off' : state.waiting ? 'cloud-upload-outline' : 'cloud-check-outline'} size={quiet ? 19 : 16} color={tone} />
      {quiet ? null : <Text style={{ flexShrink: 1, color: tone, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}
