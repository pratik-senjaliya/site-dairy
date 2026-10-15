'use client';

import { BellOutlined } from '@ant-design/icons';
import { colors } from '@site-diary/ui-tokens';
import { Badge, Button, Dropdown, Layout, Menu, Popover, Spin, Typography, List } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { post } from '../lib/api';
import { clearCache, useFetch } from '../lib/hooks';
import { dateTime, ROLE_LABEL } from '../lib/format';
import { SessionProvider, useCan, useMe } from '../lib/session';

interface Notice { id: string; title: string; body: string | null; createdAt: string; readAt: string | null }

function Bell() {
  const { data, reload } = useFetch<{ items: Notice[]; unread: number }>('/notifications');
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      onOpenChange={(open) => { if (open && data?.unread) void post('/notifications/read').then(reload); }}
      content={
        <List
          style={{ width: 360, maxHeight: 420, overflow: 'auto' }}
          dataSource={data?.items ?? []}
          locale={{ emptyText: 'No notifications' }}
          renderItem={(n) => (
            <List.Item>
              <List.Item.Meta title={<span style={{ fontWeight: n.readAt ? 400 : 700 }}>{n.title}</span>} description={<>{n.body}<br /><small>{dateTime(n.createdAt)}</small></>} />
            </List.Item>
          )}
        />
      }
    >
      <Badge count={data?.unread ?? 0} size="small"><Button type="text" aria-label="Notifications" icon={<BellOutlined style={{ fontSize: 18 }} />} /></Badge>
    </Popover>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const me = useMe();
  const can = useCan();
  const path = usePathname();
  const router = useRouter();
  const approvals = useFetch<{ count: number }>('/approvals/count');
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (window.innerWidth < 900) setCollapsed(true);
  }, []);

  const items = [
    { key: '/', label: 'Dashboard', show: true },
    { key: '/approvals', label: <Badge count={approvals.data?.count ?? 0} size="small" offset={[10, 0]}>Approvals</Badge>, show: can('attendance', 'A') || can('indent', 'A') || can('po', 'A') || can('wages', 'A') },
    { key: '/projects', label: 'Sites & structure', show: true },
    { key: '/contractors', label: 'Contractors & labour', show: true },
    { key: '/attendance', label: 'Attendance register', show: can('attendance', 'V') },
    { key: '/wages', label: 'Wages & advances', show: can('wages', 'V') },
    { key: '/materials', label: 'Materials & suppliers', show: true },
    { key: '/purchase', label: 'Indents & POs', show: can('indent', 'V') || can('po', 'V') },
    { key: '/store', label: 'Store & stock', show: can('store', 'V') },
    { key: '/progress', label: 'Progress & photos', show: can('progress', 'V') },
    { key: '/reports', label: 'Reports & exports', show: can('reports', 'V') },
    { key: '/users', label: 'Users & site access', show: can('users', 'C') },
    { key: '/settings', label: 'Settings', show: true },
    { key: '/audit', label: 'Audit log', show: can('users', 'A') },
    { key: '/import', label: 'Bulk import', show: can('users', 'C') },
  ].filter((i) => i.show);
  const selected = items.map((i) => i.key).filter((k) => k === '/' ? path === '/' : path.startsWith(k)).at(-1) ?? '/';

  if (!me) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>;
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg" width={232} theme="light" style={{ borderRight: `1px solid ${colors.border}` }}>
        <div style={{ padding: '18px 20px', fontWeight: 800, fontSize: 18, color: colors.primary }}>{collapsed ? 'SD' : 'Site Diary'}</div>
        <Menu mode="inline" selectedKeys={[selected]} items={items.map((i) => ({ key: i.key, label: <Link href={i.key}>{i.label}</Link> }))} style={{ borderInlineEnd: 0 }} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 20 }}>
          <Typography.Text strong>{me.company.name}</Typography.Text>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Bell />
            <Dropdown
              menu={{
                items: [
                  { key: 'role', label: `${ROLE_LABEL[me.user.role]} · ${me.user.phone}`, disabled: true },
                  { key: 'logout', label: 'Sign out', onClick: () => void post('/auth/logout').finally(() => { clearCache(); router.replace('/login'); }) },
                ],
              }}
            >
              <Button type="text">{me.user.name}</Button>
            </Dropdown>
          </div>
        </Layout.Header>
        <Layout.Content style={{ padding: 20, maxWidth: 1400, width: '100%', margin: '0 auto' }}>{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <SessionProvider><Shell>{children}</Shell></SessionProvider>;
}
