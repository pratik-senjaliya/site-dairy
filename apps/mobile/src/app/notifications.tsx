import { router } from 'expo-router';
import { useEffect } from 'react';
import { Banner, Card, Empty, Screen, T } from '../components/ui';
import { post } from '../lib/api';
import { useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';

interface Notice { id: string; kind: string; title: string; body: string | null; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string }

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
  };
  return (
    <Screen title={t('notifications.title')}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {data && !data.items.length ? <Empty text={t('notifications.none')} /> : null}
      {data?.items.map((n) => (
        <Card key={n.id} onPress={() => open(n)} style={n.readAt ? undefined : { borderLeftWidth: 4 }}>
          <T.body bold>{n.title}</T.body>
          {n.body ? <T.small>{n.body}</T.small> : null}
          <T.small>{new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</T.small>
        </Card>
      ))}
    </Screen>
  );
}
