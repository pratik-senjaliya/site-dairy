import { colors } from '@site-diary/ui-tokens';
import { Banner, Button, Card, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { useT } from '../lib/i18n';

const LABEL: Record<string, string> = { attendanceEntry: 'home.attendance', grn: 'home.materialIn', grnLine: 'home.materialIn', materialIssue: 'home.materialUsed', dailyProgress: 'home.progress', advance: 'home.advance', indent: 'home.indent', indentLine: 'home.indent', issue: 'home.issues', photo: 'report.photos', siteDay: 'home.progress', stockTransfer: 'home.transfers' };

// M16: what is still on this phone, and anything the office refused.
export default function Sync() {
  const t = useT();
  const s = useDb(() => ({
    outbox: db.outboxRows(), photos: db.photos.length, syncing: db.syncing, online: db.online, lastSync: db.lastSync, lastError: db.lastError, errors: db.errors, pending: db.pending.size,
  }));
  const counts = new Map<string, number>();
  for (const o of s.outbox) counts.set(LABEL[o.table] ?? o.table, (counts.get(LABEL[o.table] ?? o.table) ?? 0) + 1);

  return (
    <Screen title={t('sync.title')} footer={<Button label={s.syncing ? t('sync.syncing') : t('sync.now')} busy={s.syncing} onPress={() => void db.sync()} />}>
      {!s.online || s.lastError === 'offline' ? <Banner text={t('sync.offline')} /> : s.lastError ? <Banner tone="error" text={s.lastError} /> : null}
      <Card>
        <T.big color={s.outbox.length + s.photos ? colors.warning : colors.success}>{s.outbox.length + s.photos}</T.big>
        <T.body>{s.outbox.length + s.photos ? t('sync.waiting') : t('sync.allSent')}</T.body>
        {[...counts].map(([k, n]) => <T.small key={k}>{t(k as 'home.attendance')}: {n}</T.small>)}
        {s.photos ? <T.small>{t('report.photos')}: {s.photos}</T.small> : null}
        <T.small>{t('sync.last')}: {s.lastSync ? new Date(s.lastSync).toLocaleString('en-IN') : '—'}</T.small>
      </Card>
      {s.pending ? <Banner tone="info" text={t('sync.pendingApproval', { count: s.pending })} /> : null}
      {s.errors.length ? (
        <Card>
          <T.h2>{t('sync.refused')}</T.h2>
          {s.errors.map((e) => (
            <Row key={`${e.table}${e.id}${e.at}`} style={{ alignItems: 'flex-start' }}>
              <T.small color={colors.danger}>{t((LABEL[e.table] ?? 'sync.title') as 'sync.title')}: {e.reason}</T.small>
            </Row>
          ))}
          <Button kind="ghost" small label={t('sync.clear')} onPress={() => { db.errors = []; void db.sync(); }} />
        </Card>
      ) : null}
    </Screen>
  );
}
