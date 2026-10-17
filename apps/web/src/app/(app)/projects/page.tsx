'use client';

import { PROJECT_TYPES } from '@site-diary/shared';
import { Button, Table, Tabs, Tag } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { MasterCrud } from '@/components/MasterCrud';
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
      <Tabs items={[{ key: 's', label: 'Sites', children: (
      <Table rowKey="id" dataSource={data ?? []} pagination={false} scroll={{ x: 'max-content' }} columns={[
        { title: 'Site', dataIndex: 'name', render: (v: string, r: Project) => <Link href={`/projects/${r.id}`}>{v}</Link> },
        { title: 'Type', dataIndex: 'type', render: (v: string) => TYPE_LABEL[v] },
        { title: 'Address', dataIndex: 'address' },
        { title: 'Start', dataIndex: 'startDate', render: date },
        { title: 'Budget', dataIndex: 'budgetPaise', align: 'right', render: money },
        { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v.replace('_', ' ')}</Tag> },
      ]} />
      ) }, {
        key: 't', label: 'Work-item templates', children: (
          <MasterCrud kind="workItemTemplate" canEdit={can('projects', 'C')} addLabel="Add work item to a template"
            columns={[{ title: 'Project type', dataIndex: 'projectType', render: (v: string) => TYPE_LABEL[v] }, { title: 'Gujarati', dataIndex: 'nameGu' }, { title: 'English', dataIndex: 'nameEn' }, { title: 'Order', dataIndex: 'sort' }]}
            fields={[
              { name: 'projectType', label: 'Project type', type: 'select', required: true, options: PROJECT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })) },
              { name: 'nameGu', label: 'Name (Gujarati)', required: true }, { name: 'nameEn', label: 'Name (English)', required: true }, { name: 'sort', label: 'Order', type: 'number' },
            ]} />
        ),
      }]} />
      <ProjectForm open={open} project={null} onClose={(saved) => { setOpen(false); if (saved) { void reload(); void reloadMe(); } }} />
    </Page>
  );
}
