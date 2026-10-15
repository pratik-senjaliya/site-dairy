'use client';

import { App, Button, Card, Empty, Input, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { errorText, post } from '@/lib/api';
import { date, dateTime, money, qty } from '@/lib/format';
import { useFetch } from '@/lib/hooks';

interface Approval {
  id: string; entityType: string; status: string; project: string | null; requestedBy: string | null; decidedBy: string | null; reason: string | null; createdAt: string; decidedAt: string | null;
  details?: Record<string, unknown> & { lines?: { material?: { nameEn: string; unit: string }; qty: number }[]; current?: Record<string, number> | null; proposed?: Record<string, number | string> };
}
const LABEL: Record<string, string> = { attendanceEntry: 'Late attendance change', indent: 'Material indent', purchaseOrder: 'Purchase order', wageSettlement: 'Wage settlement' };
const TONE: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', withdrawn: 'default' };

function Details({ a }: { a: Approval }) {
  const d = a.details ?? {};
  if (a.entityType === 'indent') return <>{d.lines?.map((l, i) => <div key={i}>{l.material?.nameEn} — {qty(l.qty)} {l.material?.unit}</div>)}{d.neededBy ? <Typography.Text type="secondary">Needed by {date(String(d.neededBy))}</Typography.Text> : null}</>;
  if (a.entityType === 'purchaseOrder') return <>{String(d.poNo)} · {String(d.supplier)} · <b>{money(Number(d.totalPaise))}</b></>;
  if (a.entityType === 'wageSettlement') return <>{String(d.contractor)} · {date(String(d.periodFrom))} – {date(String(d.periodTo))}<br />{money(Number(d.grossPaise))} − advances {money(Number(d.advancesPaise))} = <b>{money(Number(d.netPaise))}</b></>;
  if (a.entityType === 'attendanceEntry' && d.proposed) {
    const p = d.proposed;
    return <>{date(String(p.date))} · {String(d.contractor)} · {String(d.skill)}<br />{d.current ? `${d.current.count} full + ${d.current.halfDayCount} half → ` : 'new → '}<b>{p.count} full + {p.halfDayCount} half, OT {p.otHours}</b></>;
  }
  return null;
}

export default function ApprovalsPage() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const { data, error, reload } = useFetch<Approval[]>(`/approvals?status=${status}`);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (a: Approval, decision: 'approve' | 'reject') => {
    setBusy(a.id);
    try {
      await post(`/approvals/${a.id}/decide`, { decision, reason: notes[a.id] || undefined });
      message.success(decision === 'approve' ? 'Approved' : 'Rejected');
      await reload();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Approvals" error={error} extra={<Segmented value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />}>
      {status === 'pending' ? (
        data?.length ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            {data.map((a) => (
              <Card key={a.id} title={LABEL[a.entityType] ?? a.entityType} extra={<Typography.Text type="secondary">{a.project} · {a.requestedBy} · {dateTime(a.createdAt)}</Typography.Text>}>
                <Details a={a} />
                <Space style={{ marginTop: 12 }} wrap>
                  <Input placeholder="Note (needed to reject)" style={{ width: 320 }} value={notes[a.id]} onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))} />
                  <Button danger loading={busy === a.id} onClick={() => void decide(a, 'reject')}>Reject</Button>
                  <Button type="primary" loading={busy === a.id} onClick={() => void decide(a, 'approve')}>Approve</Button>
                </Space>
              </Card>
            ))}
          </Space>
        ) : <Empty description="Nothing is waiting for you" />
      ) : (
        <Table rowKey="id" dataSource={data ?? []} pagination={{ pageSize: 50 }} scroll={{ x: 'max-content' }} columns={[
          { title: 'What', dataIndex: 'entityType', render: (v: string) => LABEL[v] ?? v },
          { title: 'Site', dataIndex: 'project' },
          { title: 'Asked by', dataIndex: 'requestedBy' },
          { title: 'Decided by', dataIndex: 'decidedBy' },
          { title: 'When', dataIndex: 'decidedAt', render: dateTime },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={TONE[v]}>{v}</Tag> },
          { title: 'Note', dataIndex: 'reason' },
        ]} />
      )}
    </Page>
  );
}
