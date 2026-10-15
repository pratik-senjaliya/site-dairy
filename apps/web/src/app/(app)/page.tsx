'use client';

import { colors } from '@site-diary/ui-tokens';
import { Alert, Card, Col, DatePicker, Empty, List, Row, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { useFetch } from '@/lib/hooks';
import { qty } from '@/lib/format';

interface Site {
  project: { id: string; name: string }; marker: string; note: string | null;
  labour: { workers: number; yesterday: number; avg7: number; changePct: number | null; byContractor: { contractor: string; workers: number }[] };
  materialIn: { material: string; qty: number; unit: string; supplier: string | null }[];
  materialUsed: { material: string; qty: number; unit: string }[];
  progress: { workItem: string; floor: string | null; percent: number }[];
  photos: { id: string; uploaded: boolean }[]; openIssues: number; alerts: string[]; missing: string[];
}
interface Dashboard { date: string; totals: { workers: number; yesterday: number; grnLines: number; issues: number; photos: number; sitesMissingEntry: number; pendingApprovals: number }; sites: Site[] }

// W1: today across sites — labour vs yesterday, material in/used, photos, missing entries, alerts.
export default function DashboardPage() {
  const [date, setDate] = useState<string | null>(null);
  const { data, error } = useFetch<Dashboard>(`/dashboard${date ? `?date=${date}` : ''}`);
  const t = data?.totals;
  return (
    <Page title="Today across sites" error={error} extra={<DatePicker allowClear value={date ? dayjs(date) : null} onChange={(d) => setDate(d ? d.format('YYYY-MM-DD') : null)} format="DD MMM YYYY" placeholder="Today" />}>
      {t ? (
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}><Card><Statistic title="Workers" value={t.workers} suffix={<Typography.Text type="secondary" style={{ fontSize: 13 }}>yesterday {t.yesterday}</Typography.Text>} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title="Material receipts (lines)" value={t.grnLines} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title="Photos" value={t.photos} /></Card></Col>
          <Col xs={12} md={6}><Link href="/approvals"><Card hoverable><Statistic title="Pending approvals" value={t.pendingApprovals} valueStyle={{ color: t.pendingApprovals ? colors.primary : undefined }} /></Card></Link></Col>
        </Row>
      ) : null}
      {data && !data.sites.length ? <Empty description={<>No active sites yet. <Link href="/projects">Add a site</Link></>} /> : null}
      <Row gutter={[16, 16]}>
        {data?.sites.map((s) => (
          <Col xs={24} lg={12} key={s.project.id}>
            <Card title={s.project.name} extra={<Typography.Text strong>{s.labour.workers} workers{s.labour.changePct !== null ? <Tag style={{ marginLeft: 8 }} color={Math.abs(s.labour.changePct) >= 20 ? 'orange' : 'default'}>{s.labour.changePct > 0 ? '+' : ''}{s.labour.changePct}% vs 7-day</Tag> : null}</Typography.Text>}>
              {s.marker !== 'work' ? <Alert type="info" message={`${s.marker.replace('_', ' ')}${s.note ? `: ${s.note}` : ''}`} style={{ marginBottom: 12 }} /> : null}
              {s.alerts.map((a) => <Alert key={a} type="warning" showIcon message={a} style={{ marginBottom: 8 }} />)}
              {s.missing.length && s.marker === 'work' ? <Alert type="error" showIcon message={`Not entered: ${s.missing.join(', ')}`} style={{ marginBottom: 8 }} /> : null}
              <Row gutter={16}>
                <Col span={12}>
                  <Typography.Text type="secondary">Labour by contractor</Typography.Text>
                  <List size="small" dataSource={s.labour.byContractor} locale={{ emptyText: '—' }} renderItem={(c) => <List.Item><span>{c.contractor}</span><b>{c.workers}</b></List.Item>} />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">Material in / used</Typography.Text>
                  <List size="small" dataSource={[...s.materialIn.map((m) => `↓ ${m.material} ${qty(m.qty)} ${m.unit}`), ...s.materialUsed.map((m) => `↑ ${m.material} ${qty(m.qty)} ${m.unit}`)]} locale={{ emptyText: '—' }} renderItem={(x) => <List.Item>{x}</List.Item>} />
                </Col>
              </Row>
              <Typography.Text type="secondary">Work: </Typography.Text>
              {s.progress.length ? s.progress.map((p, i) => <Tag key={i}>{p.workItem}{p.floor ? ` · ${p.floor}` : ''} {p.percent}%</Tag>) : '—'}
              <div style={{ marginTop: 8 }}><Typography.Text type="secondary">{s.photos.length} photos · {s.openIssues} open issues · <Link href={`/progress?site=${s.project.id}`}>Progress & photos</Link></Typography.Text></div>
            </Card>
          </Col>
        ))}
      </Row>
    </Page>
  );
}
