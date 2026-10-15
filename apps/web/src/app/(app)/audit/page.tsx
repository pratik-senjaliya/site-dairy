'use client';

import { Button, DatePicker, Drawer, Select, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { dateTime } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';

interface Entry { id: number; at: string; user: string | null; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; ip: string | null; deviceId: string | null }

const TYPES = ['attendanceEntry', 'advance', 'grn', 'grnLine', 'materialIssue', 'stockTransfer', 'dailyProgress', 'issue', 'indent', 'purchaseOrder', 'wageSettlement', 'supplierPayment', 'contractor', 'contractorRate', 'material', 'supplier', 'project', 'user', 'company', 'report'];

// W13: who changed what, old and new value, when, from which device. Append-only in the database.
export default function AuditPage() {
  const L = useLookups();
  const [page, setPage] = useState(1);
  const [entityType, setType] = useState<string>();
  const [userId, setUser] = useState<string>();
  const [range, setRange] = useState<[string, string] | null>(null);
  const qs = new URLSearchParams({ page: String(page), ...(entityType && { entityType }), ...(userId && { userId }), ...(range && { from: range[0], to: range[1] }) }).toString();
  const { data, error } = useFetch<{ total: number; rows: Entry[] }>(`/audit?${qs}`);
  const [open, setOpen] = useState<Entry | null>(null);
  return (
    <Page title="Audit log" error={error} extra={<>
      <Select allowClear placeholder="Record type" style={{ width: 200 }} value={entityType} onChange={(v) => { setType(v); setPage(1); }} options={TYPES.map((t) => ({ value: t, label: t }))} />
      <Select allowClear placeholder="Person" style={{ width: 200 }} value={userId} onChange={(v) => { setUser(v); setPage(1); }} options={L.users.map((u) => ({ value: u.id, label: String(u.name) }))} />
      <DatePicker.RangePicker format="DD MMM" onChange={(v) => { setRange(v?.[0] && v[1] ? [v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')] : null); setPage(1); }} value={range ? [dayjs(range[0]), dayjs(range[1])] : null} />
    </>}>
      <Table rowKey="id" size="small" dataSource={data?.rows ?? []} scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 50, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'When', dataIndex: 'at', render: dateTime },
          { title: 'Who', dataIndex: 'user' },
          { title: 'Action', dataIndex: 'action' },
          { title: 'Record', dataIndex: 'entityType' },
          { title: 'Device', dataIndex: 'deviceId', render: (v: string | null) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v?.slice(0, 18)}</Typography.Text> },
          { key: 'v', render: (_: unknown, r: Entry) => (r.before || r.after ? <Button size="small" onClick={() => setOpen(r)}>Changes</Button> : null) },
        ]} />
      <Drawer open={!!open} width={640} title={`${open?.action ?? ''} · ${open?.entityType ?? ''}`} onClose={() => setOpen(null)}>
        {open ? <ChangeTable before={open.before} after={open.after} /> : null}
      </Drawer>
    </Page>
  );
}

function ChangeTable({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const skip = new Set(['updatedAt', 'serverRev', 'createdAt', 'companyId']);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !skip.has(k));
  const show = (v: unknown) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <Table size="small" pagination={false} rowKey="k" dataSource={keys.map((k) => ({ k, before: show(b[k]), after: show(a[k]), changed: show(b[k]) !== show(a[k]) && k in b }))}
      columns={[{ title: 'Field', dataIndex: 'k' }, { title: 'Before', dataIndex: 'before' }, { title: 'After', dataIndex: 'after', render: (v: string, r: { changed: boolean }) => (r.changed ? <b>{v}</b> : v) }]} />
  );
}
