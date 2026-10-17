import type { PushTable } from '@site-diary/shared';
import { colors } from '@site-diary/ui-tokens';
import { db } from '../lib/db';
import { confirm } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { Button, Card, Row, T } from './ui';

export interface Entry { id: string; table: PushTable; label: string; sub?: string; locked?: string }

/** What this site entered today, with delete for mistakes (the office keeps the history in the audit log). */
export function TodayEntries({ entries }: { entries: Entry[] }) {
  const t = useT();
  if (!entries.length) return null;
  return (
    <Card>
      <T.h2>{t('common.todayEntries')}</T.h2>
      {entries.map((e) => (
        <Row key={e.id} style={{ justifyContent: 'space-between' }}>
          <Row style={{ flex: 1, flexWrap: 'wrap' }}>
            <T.body>{e.label}</T.body>
            {e.sub ? <T.small>{e.sub}</T.small> : null}
            {db.isUnsynced(e.table, e.id) ? <T.small color={colors.warning}>↑</T.small> : null}
          </Row>
          {e.locked ? <T.small>{e.locked}</T.small> : (
            <Button kind="ghost" small label={t('common.delete')} onPress={() => void confirm(t('common.deleteConfirm'), e.label, t('common.delete'), t('common.cancel')).then((ok) => ok && db.remove(e.table, e.id))} />
          )}
        </Row>
      ))}
    </Card>
  );
}
