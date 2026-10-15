'use client';

import { daysBetween, isoDate, addDays, type PushResult } from '@site-diary/shared';
import { App, Button, DatePicker, Form, InputNumber, Modal, Select, Space, Table, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { errorText, fileUrl, post } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';
import { useCan } from '@/lib/session';

interface Entry { id: string; date: string; contractorId: string; skillId: string; count: number; halfDayCount: number; otHours: number; locked: boolean }
type Cell = { date: string; contractorId: string; skillId: string; entry?: Entry };

// W4: site × date grid. Owners and engineers can correct a past day (logged; the owner is told).
export default function AttendancePage() {
  const { message } = App.useApp();
  const can = useCan();
  const L = useLookups();
  const [site, setSite] = useState<string | undefined>();
  const [range, setRange] = useState<[string, string]>([addDays(isoDate(), -6), isoDate()]);
  const { data, error, reload } = useFetch<Entry[]>(site ? `/registers/attendance?projectId=${site}&from=${range[0]}&to=${range[1]}` : null);
  const [cell, setCell] = useState<Cell | null>(null);
  const [form] = Form.useForm();
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState<{ contractorId: string; skillId: string }[]>([]);
  const days = daysBetween(range[0], range[1]);
  const editable = can('attendance', 'A');

  const rows = useMemo(() => {
    const keys = new Map<string, { contractorId: string; skillId: string }>();
    for (const e of data ?? []) keys.set(`${e.contractorId}:${e.skillId}`, { contractorId: e.contractorId, skillId: e.skillId });
    for (const x of extra) keys.set(`${x.contractorId}:${x.skillId}`, x);
    return [...keys.entries()].map(([key, k]) => ({ key, ...k, entries: Object.fromEntries((data ?? []).filter((e) => e.contractorId === k.contractorId && e.skillId === k.skillId).map((e) => [e.date, e])) as Record<string, Entry> }))
      .sort((a, b) => String(L.contractor(a.contractorId)?.name).localeCompare(String(L.contractor(b.contractorId)?.name)));
  }, [data, extra, L]);

  const save = async () => {
    if (!cell || !site) return;
    const v = (await form.validateFields()) as { count: number; halfDayCount: number; otHours: number };
    try {
      const r = await post<PushResult>('/sync/push', { changes: { attendanceEntry: [{ id: cell.entry?.id ?? crypto.randomUUID(), projectId: site, date: cell.date, contractorId: cell.contractorId, skillId: cell.skillId, ...v }] } });
      if (r.rejected.length) throw new Error(r.rejected[0]!.reason);
      message.success(r.pending.length ? 'Sent for approval' : 'Saved');
      setCell(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const total = (d: string) => (data ?? []).filter((e) => e.date === d).reduce((s, e) => s + e.count + e.halfDayCount, 0);

  return (
    <Page title="Attendance register" error={error} extra={<>
      <SitePicker value={site} onChange={setSite} />
      <DatePicker.RangePicker value={[dayjs(range[0]), dayjs(range[1])]} format="DD MMM" allowClear={false} onChange={(v) => v?.[0] && v[1] && setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])} />
      {site ? <Button href={fileUrl(`/reports/attendance?projectId=${site}&from=${range[0]}&to=${range[1]}&format=xlsx`)}>Excel</Button> : null}
    </>}>
      <Typography.Text type="secondary">Each cell: full-day workers (+ half-day). {editable ? 'Click a cell to correct it.' : ''}</Typography.Text>
      <Table
        size="small" bordered pagination={false} scroll={{ x: 'max-content' }} dataSource={rows}
        columns={[
          { title: 'Contractor', dataIndex: 'contractorId', fixed: 'left', render: (v: string) => String(L.contractor(v)?.name ?? '') },
          { title: 'Skill', dataIndex: 'skillId', fixed: 'left', render: (v: string) => `${String(L.skill(v)?.nameGu ?? '')}` },
          ...days.map((d) => ({
            title: dayjs(d).format('ddd DD'), key: d, align: 'center' as const, width: 64,
            render: (_: unknown, r: (typeof rows)[number]) => {
              const e = r.entries[d];
              const text = e ? `${e.count}${e.halfDayCount ? `+${e.halfDayCount}` : ''}${Number(e.otHours) ? '*' : ''}` : '·';
              return editable ? (
                <Tooltip title={e && Number(e.otHours) ? `OT ${e.otHours} h` : undefined}>
                  <Button type="text" size="small" onClick={() => { setCell({ date: d, contractorId: r.contractorId, skillId: r.skillId, entry: e }); form.setFieldsValue({ count: e?.count ?? 0, halfDayCount: e?.halfDayCount ?? 0, otHours: Number(e?.otHours ?? 0) }); }}>{text}</Button>
                </Tooltip>
              ) : text;
            },
          })),
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2}><b>Workers</b></Table.Summary.Cell>
            {days.map((d, i) => <Table.Summary.Cell key={d} index={i + 2} align="center"><b>{total(d) || ''}</b></Table.Summary.Cell>)}
          </Table.Summary.Row>
        )}
      />
      {editable ? (adding ? <AddRow onAdd={(x) => { setExtra((e) => [...e, x]); setAdding(false); }} onCancel={() => setAdding(false)} /> : <Button onClick={() => setAdding(true)}>Add contractor × skill row</Button>) : null}
      <Modal open={!!cell} title={cell ? `${String(L.contractor(cell.contractorId)?.name ?? '')} · ${String(L.skill(cell.skillId)?.nameEn ?? '')} · ${dayjs(cell.date).format('DD MMM YYYY')}` : ''} onCancel={() => setCell(null)} onOk={() => void save()} okText="Save">
        <Form form={form} layout="vertical">
          <Space>
            <Form.Item name="count" label="Full day"><InputNumber min={0} max={999} /></Form.Item>
            <Form.Item name="halfDayCount" label="Half day"><InputNumber min={0} max={999} /></Form.Item>
            <Form.Item name="otHours" label="Overtime hours"><InputNumber min={0} max={9999} /></Form.Item>
          </Space>
          {cell && cell.date < isoDate() ? <Typography.Text type="warning">This day is locked. Your change is logged and the owner is told.</Typography.Text> : null}
        </Form>
      </Modal>
    </Page>
  );

  function AddRow({ onAdd, onCancel }: { onAdd: (x: { contractorId: string; skillId: string }) => void; onCancel: () => void }) {
    const [c, setC] = useState<string>();
    const [s, setS] = useState<string>();
    return (
      <Space wrap>
        <Select style={{ width: 240 }} placeholder="Contractor" value={c} onChange={setC} options={L.contractors.map((x) => ({ value: x.id, label: String(x.name) }))} />
        <Select style={{ width: 240 }} placeholder="Skill" value={s} onChange={setS} options={L.skills.map((x) => ({ value: x.id, label: `${x.nameEn} · ${x.nameGu}` }))} />
        <Button type="primary" disabled={!c || !s} onClick={() => onAdd({ contractorId: c!, skillId: s! })}>Add</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Space>
    );
  }
}
