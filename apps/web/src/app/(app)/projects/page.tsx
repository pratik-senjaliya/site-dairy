'use client';

import { Button, Table, Tag } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { ProjectForm, TYPE_LABEL, type Project } from '@/components/ProjectForm';
import { date, money } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useCan, useReloadMe } from '@/lib/session';

// W2: sites; structure and work items on each site's page.
export default function ProjectsPage() {
  const can = useCan();
  const reloadMe = useReloadMe();
  const { data, error, reload } = useFetch<Project[]>('/projects');
  const [open, setOpen] = useState(false);
  return (
    <Page title="Sites" error={error} extra={can('projects', 'C') ? <Button type="primary" onClick={() => setOpen(true)}>New site</Button> : null}>
      <Table rowKey="id" dataSource={data ?? []} pagination={false} scroll={{ x: 'max-content' }} columns={[
        { title: 'Site', dataIndex: 'name', render: (v: string, r: Project) => <Link href={`/projects/${r.id}`}>{v}</Link> },
        { title: 'Type', dataIndex: 'type', render: (v: string) => TYPE_LABEL[v] },
        { title: 'Address', dataIndex: 'address' },
        { title: 'Start', dataIndex: 'startDate', render: date },
        { title: 'Budget', dataIndex: 'budgetPaise', align: 'right', render: money },
        { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v.replace('_', ' ')}</Tag> },
      ]} />
      <ProjectForm open={open} project={null} onClose={(saved) => { setOpen(false); if (saved) { void reload(); void reloadMe(); } }} />
    </Page>
  );
}
