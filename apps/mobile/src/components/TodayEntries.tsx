import type { PushTable } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { Pressable, View } from 'react-native';
import { db } from '../lib/db';
import { confirm } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { Card, Icon, Section, T } from './ui';

export interface Entry { id: string; table: PushTable; label: string; sub?: string; locked?: string }

/** What this site entered today, with delete for mistakes (the office keeps the history in the audit log). */
export function TodayEntries({ entries }: { entries: Entry[] }) {
  const t = useT();
  if (!entries.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Section title={t('common.todayEntries')} />
      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        {entries.map((e, i) => (
          <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <Icon name={db.isUnsynced(e.table, e.id) ? 'cloud-upload-outline' : 'check-circle-outline'} size={20} color={db.isUnsynced(e.table, e.id) ? colors.warning : colors.success} />
            <View style={{ flex: 1 }}>
              <T.body>{e.label}</T.body>
              {e.sub ? <T.small>{e.sub}</T.small> : null}
            </View>
            {e.locked ? <T.small>{e.locked}</T.small> : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.delete')}
                hitSlop={8}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => void confirm(t('common.deleteConfirm'), e.label, t('common.delete'), t('common.cancel')).then((ok) => ok && db.remove(e.table, e.id))}
              >
                <Icon name="trash-can-outline" size={22} color={colors.danger} />
              </Pressable>
            )}
          </View>
        ))}
      </Card>
    </View>
  );
}
