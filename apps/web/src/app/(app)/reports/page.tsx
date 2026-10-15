'use client';

import { addDays, isoDate } from '@site-diary/shared';
import { Button, Card, Col, DatePicker, Row, Select, Space, Statistic, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { fileUrl } from '@/lib/api';
import { date, money, qty } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';

interface Report { title: string; subtitle: string; highlights: { label: string; value: string }[]; tables: { title: string; columns: { key: string; header: string; fmt?: string }[]; rows: Record<string, unknown>[]; totals?: string[] }[] }

const TYPES = [
  { value: 'daily', label: 'Daily site report', range: false },
  { value: 'attendance', label: 'Attendance register', range: true },
  { value: 'wages', label: 'Wage settlement sheet', range: true },
  { value: 'grn', label: 'GRN register', range: true },
  { value: 'stock', label: 'Stock statement', range: false },
  { value: 'consumption', label: 'Consumption by floor / work item', range: true },
  { value: 'supplier-ledger', label: 'Supplier ledger', range: false },
  { value: 'monthly', label: 'Monthly summary for the CA', range: true },
];
const fmt = (v: unknown, f?: string) => (v == null || v === '' ? '' : f === 'money' ? money(Number(v)) : f === 'int' || f === 'qty' ? qty(Number(v)) : f === 'date' ? date(String(v)) : String(v));

// W10: every report on screen, in Excel and as PDF (the same data).
export default function ReportsPage() {
  const L = useLookups();
  const [type, setType] = useState('daily');
  const [site, setSite] = useState<string | undefined>();
  const [supplier, setSupplier] = useState<string | undefined>();
  const [range, setRange] = useState<[string, string]>([dayjs().startOf('month').format('YYYY-MM-DD'), isoDate()]);
  const meta = TYPES.find((t) => t.value === type)!;
  const from = meta.range ? range[0] : range[1];
  const params = new URLSearchParams({ projectId: site ?? 'all', from, to: range[1], ...(supplier && { supplierId: supplier }) }).toString();
  const ready = type !== 'supplier-ledger' || !!supplier;
  const { data, error, loading } = useFetch<Report>(ready ? `/reports/${type}?${params}` : null);

  return (
    <Page title="Reports & exports" error={error} extra={ready ? <>
      <Button href={fileUrl(`/reports/${type}?${params}&format=xlsx`)}>Excel</Button>
      <Button href={fileUrl(`/reports/${type}?${params}&format=pdf`)} target="_blank">PDF</Button>
    </> : null}>
      <Space wrap>
        <Select style={{ width: 280 }} value={type} onChange={setType} options={TYPES} />
        {type === 'supplier-ledger'
          ? <Select style={{ width: 260 }} placeholder="Supplier" value={supplier} onChange={setSupplier} options={L.suppliers.map((s) => ({ value: s.id, label: String(s.name) }))} />
          : <SitePicker value={site} onChange={setSite} allowAll />}
        {meta.range
          ? <DatePicker.RangePicker value={[dayjs(range[0]), dayjs(range[1])]} format="DD MMM YYYY" allowClear={false} onChange={(v) => v?.[0] && v[1] && setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])}
              presets={[{ label: 'This month', value: [dayjs().startOf('month'), dayjs()] }, { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] }, { label: 'Last 7 days', value: [dayjs(addDays(isoDate(), -6)), dayjs()] }]} />
          : type === 'daily' ? <DatePicker value={dayjs(range[1])} format="DD MMM YYYY" allowClear={false} onChange={(d) => d && setRange([range[0], d.format('YYYY-MM-DD')])} /> : null}
      </Space>
      {data ? (
        <Card loading={loading && !data}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>{data.title}</Typography.Title>
          <Typography.Text type="secondary">{data.subtitle}</Typography.Text>
          <Row gutter={16} style={{ margin: '16px 0' }}>{data.highlights.map((h) => <Col key={h.label}><Statistic title={h.label} value={h.value} /></Col>)}</Row>
          {data.tables.map((tb, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <Typography.Title level={5}>{tb.title}</Typography.Title>
              <Table size="small" pagination={tb.rows.length > 100 ? { pageSize: 100 } : false} scroll={{ x: 'max-content' }} rowKey={(_, idx) => String(idx)} dataSource={tb.rows}
                columns={tb.columns.map((c) => ({ title: c.header, dataIndex: c.key, align: ['money', 'int', 'qty'].includes(c.fmt ?? '') ? 'right' as const : 'left' as const, render: (v: unknown) => fmt(v, c.fmt) }))}
                summary={tb.totals?.length && tb.rows.length ? () => (
                  <Table.Summary.Row>{tb.columns.map((c, ci) => <Table.Summary.Cell key={c.key} index={ci} align={tb.totals!.includes(c.key) ? 'right' : 'left'}><b>{ci === 0 ? 'Total' : tb.totals!.includes(c.key) ? fmt(tb.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0), c.fmt) : ''}</b></Table.Summary.Cell>)}</Table.Summary.Row>
                ) : undefined} />
            </div>
          ))}
        </Card>
      ) : null}
    </Page>
  );
}
