import { router } from 'expo-router';
import { useEffect } from 'react';
import { Banner, Card, Empty, flush, ListRow, Screen, type IconName, type Tone } from '../components/ui';
import { post } from '../lib/api';
import { useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';

interface Notice { id: string; kind: string; title: string; body: string | null; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string }

const ICON: Record<string, IconName> = {
  approval_needed: 'check-decagram-outline', approved: 'check-circle-outline', rejected: 'close-circle-outline', low_stock: 'warehouse',
  nightly_report: 'file-chart-outline', issue_assigned: 'alert-circle-outline', no_entry: 'clock-alert-outline', late_edit: 'pencil-outline',
  wages_due: 'cash-multiple', report_failed: 'alert-octagon-outline',
};
const TONE: Record<string, Tone> = { rejected: 'danger', low_stock: 'warn', no_entry: 'warn', report_failed: 'danger', approved: 'ok', wages_due: 'ok' };

export default function Notifications() {
  const t = useT();
  const { data, error, reload } = useOnline<{ items: Notice[]; unread: number }>('/notifications');
  useEffect(() => {
    if (data?.unread) void post('/notifications/read', {});
  }, [data?.unread]);
  const open = (n: Notice) => {
    if (n.entityType === 'approval') router.push('/approvals');
    else if (n.kind === 'low_stock') router.push('/stock');
    else if (n.kind === 'nightly_report') router.push('/reports');
    else if (n.kind === 'issue_assigned') router.push('/issues');
    else if (n.kind === 'no_entry') router.push('/attendance');
    else if (n.kind === 'wages_due') router.push('/hisab');
  };
  return (
    <Screen title={t('notifications.title')}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {data && !data.items.length ? <Empty icon="bell-sleep-outline" text={t('notifications.none')} /> : null}
      {data?.items.length ? (
        <Card style={flush}>
          {data.items.map((n, i) => (
            <ListRow
              key={n.id}
              icon={ICON[n.kind] ?? 'bell-outline'}
              tone={n.readAt ? 'muted' : TONE[n.kind] ?? 'primary'}
              title={n.title}
              detail={[n.body, new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}
              onPress={() => open(n)}
              last={i === data.items.length - 1}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
