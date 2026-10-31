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
  // All sent: just the green mark; otherwise the mark of what is happening and how many entries wait.
  const quiet = !state.syncing && !state.offline && !state.waiting;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/sync')} hitSlop={8} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.pill }, quiet ? { width: 44, height: 44 } : { height: 34, minWidth: 34, paddingHorizontal: 8, marginRight: 4, backgroundColor: soft }]}>
      <Icon name={state.syncing ? 'sync' : state.offline ? 'wifi-off' : state.waiting ? 'cloud-upload-outline' : 'cloud-check-outline'} size={quiet ? 24 : 18} color={tone} />
      {/* Just the count next to the mark: the header keeps its room for the site name; the words are read out. */}
      {state.waiting ? <Text style={{ color: tone, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{state.waiting}</Text> : null}
    </Pressable>
  );
}
