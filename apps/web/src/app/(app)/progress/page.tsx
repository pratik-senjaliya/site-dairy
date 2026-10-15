'use client';

import { addDays, isoDate } from '@site-diary/shared';
import { Card, DatePicker, Empty, Image, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { fileUrl } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';

interface Node { id: string; parentId: string | null; kind: string; name: string; sort: number }
interface Detail { structure: Node[]; workItems: { id: string; nameEn: string; nameGu: string }[] }
interface Cell { structureNodeId: string | null; workItemId: string; percent: number; date: string }
interface Photo { id: string; takenAt: string; sourceType: string; uploaded: boolean; lat: number | null; lng: number | null }
interface Issue { id: string; title: string; status: string; assignedToId: string | null; createdAt: string; resolvedAt: string | null }

const shade = (p: number) => (p >= 100 ? '#15803D' : p >= 60 ? '#65A30D' : p >= 30 ? '#CA8A04' : '#EA580C');

// W9: tower × floor × work item grid, the photo gallery, and the issues log.
function ProgressInner() {
  const L = useLookups();
  const [site, setSite] = useState<string | undefined>(useSearchParams().get('site') ?? undefined);
  const [range, setRange] = useState<[string, string]>([addDays(isoDate(), -6), isoDate()]);
  const detail = useFetch<Detail>(site ? `/projects/${site}` : null);
  const grid = useFetch<Cell[]>(site ? `/registers/progress-grid?projectId=${site}` : null);
  const photos = useFetch<Photo[]>(site ? `/registers/photos?projectId=${site}&from=${range[0]}&to=${range[1]}` : null);
  const issues = useFetch<Issue[]>(site ? `/registers/issues?projectId=${site}` : null);
  const towers = (detail.data?.structure ?? []).filter((n) => n.kind === 'tower');
  const floorsOf = (t: string) => (detail.data?.structure ?? []).filter((n) => n.parentId === t).sort((a, b) => b.sort - a.sort);
  const items = detail.data?.workItems ?? [];
  const cell = (node: string | null, item: string) => grid.data?.find((c) => c.structureNodeId === node && c.workItemId === item);

  return (
    <Page title="Progress & photos" extra={<>
      <SitePicker value={site} onChange={setSite} />
      <DatePicker.RangePicker value={[dayjs(range[0]), dayjs(range[1])]} format="DD MMM" allowClear={false} onChange={(v) => v?.[0] && v[1] && setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])} />
    </>}>
      <Tabs items={[
        {
          key: 'grid', label: 'Floor-wise progress', children: towers.length ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              {towers.map((t) => (
                <Card key={t.id} title={t.name} size="small">
                  <Table size="small" bordered pagination={false} rowKey="id" scroll={{ x: 'max-content' }} dataSource={floorsOf(t.id)} columns={[
                    { title: 'Floor', dataIndex: 'name', fixed: 'left' },
                    ...items.map((w) => ({
                      title: <span title={w.nameEn}>{w.nameGu}</span>, key: w.id, align: 'center' as const, width: 76,
                      render: (_: unknown, f: Node) => {
                        const c = cell(f.id, w.id);
                        return c ? <Tag color={shade(c.percent)} title={`last updated ${date(c.date)}`} style={{ margin: 0 }}>{c.percent}%</Tag> : '';
                      },
                    })),
                  ]} />
                </Card>
              ))}
            </Space>
          ) : <Empty description="Add towers and floors on the site page first" />,
        },
        {
          key: 'photos', label: `Photos (${photos.data?.length ?? 0})`, children: photos.data?.length ? (
            <Image.PreviewGroup>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                {photos.data.map((p) => (
                  <Card key={p.id} size="small" cover={p.uploaded ? <Image src={fileUrl(`/photos/${p.id}/file`)} height={140} style={{ objectFit: 'cover' }} alt={p.sourceType} /> : <div style={{ height: 140, display: 'grid', placeItems: 'center' }}>Uploading from phone…</div>}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{p.sourceType} · {dateTime(p.takenAt)}{p.lat ? <> · <a href={`https://maps.google.com/?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">map</a></> : null}</Typography.Text>
                  </Card>
                ))}
              </div>
            </Image.PreviewGroup>
          ) : <Empty description="No photos in these dates" />,
        },
        {
          key: 'issues', label: 'Issues', children: (
            <Table rowKey="id" dataSource={issues.data ?? []} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
              { title: 'Raised', dataIndex: 'createdAt', render: dateTime },
              { title: 'Issue', dataIndex: 'title' },
              { title: 'Assigned to', dataIndex: 'assignedToId', render: (v: string | null) => String(L.user(v)?.name ?? '—') },
              { title: 'Status', dataIndex: 'status', render: (v: string, r: Issue) => <Tag color={v === 'open' ? 'orange' : 'green'}>{v}{r.resolvedAt ? ` · ${date(r.resolvedAt)}` : ''}</Tag> },
            ]} />
          ),
        },
      ]} />
    </Page>
  );
}

export default function ProgressPage() {
  return <Suspense><ProgressInner /></Suspense>;
}
