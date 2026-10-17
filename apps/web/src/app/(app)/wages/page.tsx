'use client';

import { addDays, isoDate, type PushResult } from '@site-diary/shared';
import { App, Button, DatePicker, Descriptions, Form, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { errorText, fileUrl, get, post } from '@/lib/api';
import { date, money, qty } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';
import { useMe } from '@/lib/session';

interface Settlement { id: string; contractorId: string; periodFrom: string; periodTo: string; grossPaise: number; advancesPaise: number; netPaise: number; status: string; paidAt: string | null; paidMode: string | null }
interface Advance { id: string; contractorId: string; amountPaise: number; date: string; mode: string; settlementId: string | null }
interface Preview { manDays: number; gross: number; advances: number; net: number; missingRates: string[] }
const TONE: Record<string, string> = { submitted: 'gold', approved: 'blue', paid: 'green', rejected: 'red' };

// W5: days × rate − advances = payable; owner approves; mark paid.
export default function WagesPage() {
  const { message } = App.useApp();
  const L = useLookups();
  const [site, setSite] = useState<string | undefined>();
  const settlements = useFetch<Settlement[]>(site ? `/wages?projectId=${site}` : null);
  const advances = useFetch<Advance[]>(site ? `/wages/advances?projectId=${site}` : null);
  const [creating, setCreating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form] = Form.useForm();
  const [advForm] = Form.useForm();
  const role = useMe()?.user.role;
  const canCreate = role === 'owner' || role === 'engineer' || role === 'accountant';

  const period = () => {
    const v = form.getFieldsValue() as { contractorId?: string; range?: [dayjs.Dayjs, dayjs.Dayjs] };
    return v.contractorId && v.range ? { projectId: site!, contractorId: v.contractorId, from: v.range[0].format('YYYY-MM-DD'), to: v.range[1].format('YYYY-MM-DD') } : null;
  };
  const refreshPreview = async () => {
    const p = period();
    setPreview(p ? await get<Preview>(`/wages/preview?${new URLSearchParams(p).toString()}`).catch(() => null) : null);
  };
  const act = (fn: () => Promise<unknown>) => fn().then(() => { void settlements.reload(); void advances.reload(); }).catch((e: unknown) => message.error(errorText(e)));

  return (
    <Page title="Wages & advances" error={settlements.error} extra={<>
      <SitePicker value={site} onChange={setSite} />
      {site ? <Button href={fileUrl(`/reports/wages?projectId=${site}&from=${addDays(isoDate(), -13)}&to=${isoDate()}&format=xlsx`)}>Wage sheet (Excel)</Button> : null}
    </>}>
      <Tabs items={[
        {
          key: 's', label: 'Settlements', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              {canCreate ? <Button type="primary" onClick={() => { form.setFieldsValue({ range: [dayjs().subtract(6, 'day'), dayjs()] }); setPreview(null); setCreating(true); }}>New settlement</Button> : null}
              <Table rowKey="id" dataSource={settlements.data ?? []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
                { title: 'Contractor', dataIndex: 'contractorId', render: (v: string) => String(L.contractor(v)?.name ?? '') },
                { title: 'Period', render: (_: unknown, r: Settlement) => `${date(r.periodFrom)} – ${date(r.periodTo)}` },
                { title: 'Gross', dataIndex: 'grossPaise', align: 'right', render: money },
                { title: 'Advances', dataIndex: 'advancesPaise', align: 'right', render: money },
                { title: 'Payable', dataIndex: 'netPaise', align: 'right', render: (v: number) => <b>{money(v)}</b> },
                { title: 'Status', dataIndex: 'status', render: (v: string, r: Settlement) => <Tag color={TONE[v]}>{v === 'submitted' ? 'waiting for owner' : v}{r.paidMode ? ` · ${r.paidMode}` : ''}</Tag> },
                {
                  key: 'a', render: (_: unknown, r: Settlement) => canCreate ? (
                    <Space>
                      {r.status === 'approved' ? (
                        <Select placeholder="Mark paid…" style={{ width: 140 }} options={[{ value: 'cash', label: 'Paid in cash' }, { value: 'upi', label: 'Paid by UPI' }, { value: 'bank', label: 'Paid by bank' }]} onChange={(mode: string) => act(() => post(`/wages/${r.id}/pay`, { mode }))} />
                      ) : null}
                      {r.status !== 'paid' ? <Popconfirm title="Cancel this settlement? Its advances become unsettled again." onConfirm={() => act(() => post(`/wages/${r.id}/cancel`))}><Button size="small" danger>Cancel</Button></Popconfirm> : null}
                    </Space>
                  ) : null,
                },
              ]} />
            </Space>
          ),
        },
        {
          key: 'a', label: 'Advances (upad)', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              {canCreate ? <Button onClick={() => { advForm.setFieldsValue({ date: dayjs(), mode: 'cash' }); setAdvancing(true); }}>Record advance</Button> : null}
              <Table rowKey="id" dataSource={advances.data ?? []} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
                { title: 'Date', dataIndex: 'date', render: date },
                { title: 'Contractor', dataIndex: 'contractorId', render: (v: string) => String(L.contractor(v)?.name ?? '') },
                { title: 'Amount', dataIndex: 'amountPaise', align: 'right', render: money },
                { title: 'Mode', dataIndex: 'mode' },
                { title: '', dataIndex: 'settlementId', render: (v: string | null) => (v ? <Tag color="green">settled</Tag> : <Tag>open</Tag>) },
              ]} />
            </Space>
          ),
        },
      ]} />

      <Modal open={creating} title="New wage settlement" okText="Create" onCancel={() => setCreating(false)} okButtonProps={{ disabled: !preview || !!preview.missingRates.length || !preview.manDays }} onOk={() => {
        const p = period();
        if (p) act(async () => { await post('/wages', p); setCreating(false); message.success('Created — waiting for the owner'); });
      }}>
        <Form form={form} layout="vertical" onValuesChange={() => void refreshPreview()}>
          <Form.Item name="contractorId" label="Contractor" rules={[{ required: true }]}><Select options={L.contractors.map((c) => ({ value: c.id, label: String(c.name) }))} /></Form.Item>
          <Form.Item name="range" label="Period"><DatePicker.RangePicker format="DD MMM YYYY" style={{ width: '100%' }} /></Form.Item>
        </Form>
        {preview ? (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Man-days">{qty(preview.manDays)}</Descriptions.Item>
            <Descriptions.Item label="Gross (days × rate, OT)">{money(preview.gross)}</Descriptions.Item>
            <Descriptions.Item label="Advances to deduct">{money(preview.advances)}</Descriptions.Item>
            <Descriptions.Item label="Payable"><b>{money(preview.net)}</b></Descriptions.Item>
          </Descriptions>
        ) : null}
        {preview?.missingRates.length ? <Typography.Text type="danger">Some skills have no daily rate for this contractor. Add rates under Contractors → Daily rates.</Typography.Text> : null}
      </Modal>

      <Modal open={advancing} title="Record advance (upad)" okText="Save" onCancel={() => setAdvancing(false)} onOk={() => void advForm.validateFields().then((v: { contractorId: string; amount: number; date: dayjs.Dayjs; mode: string }) => act(async () => {
        const r = await post<PushResult>('/sync/push', { changes: { advance: [{ id: crypto.randomUUID(), projectId: site, contractorId: v.contractorId, amountPaise: Math.round(v.amount * 100), date: v.date.format('YYYY-MM-DD'), mode: v.mode }] } });
        if (r.rejected.length) throw new Error(r.rejected[0]!.reason);
        setAdvancing(false);
      }))}>
        <Form form={advForm} layout="vertical">
          <Form.Item name="contractorId" label="Contractor" rules={[{ required: true }]}><Select options={L.contractors.map((c) => ({ value: c.id, label: String(c.name) }))} /></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber prefix="₹" min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="date" label="Date"><DatePicker format="DD MMM YYYY" /></Form.Item>
          <Form.Item name="mode" label="Mode"><Select options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank' }]} /></Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
