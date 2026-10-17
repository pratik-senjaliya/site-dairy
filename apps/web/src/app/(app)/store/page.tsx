'use client';

import { addDays, isoDate } from '@site-diary/shared';
import { App, Button, DatePicker, Drawer, Form, Image, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { errorText, fileUrl, patch, post } from '@/lib/api';
import { date, money, qty } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';
import { useCan, useMe } from '@/lib/session';

interface StockRow { materialId: string; qty: number; minStock: number | null }
interface Grn { id: string; date: string; supplierId: string | null; challanNo: string | null; vehicleNo: string | null; lines: { id: string; materialId: string; qty: number; rejectedQty: number; ratePaise: number | null }[]; photos: { id: string; uploaded: boolean }[] }
interface Issue { id: string; date: string; materialId: string; qty: number; workItemId: string | null; structureNodeId: string | null }
interface Transfer { id: string; fromProjectId: string; toProjectId: string; materialId: string; qty: number; status: string; createdAt: string; receivedAt: string | null }
interface LedgerRow { id: string; date: string; sourceType: string; qtyDelta: number; balance: number }
interface SupplierLedger { duePaise: number; rows: { id: string; date: string; kind: string; ref: string | null; debitPaise: number; creditPaise: number; balancePaise: number; unpricedLines: number }[] }

// W8: stock statement and ledger, GRN register, usage, transfers, supplier ledger and payments.
export default function StorePage() {
  const { message } = App.useApp();
  const can = useCan();
  const L = useLookups();
  const [site, setSite] = useState<string | undefined>();
  const [range, setRange] = useState<[string, string]>([addDays(isoDate(), -30), isoDate()]);
  const q = site ? `projectId=${site}&from=${range[0]}&to=${range[1]}` : null;
  const stock = useFetch<StockRow[]>(site ? `/registers/stock?projectId=${site}` : null);
  const grns = useFetch<Grn[]>(q ? `/registers/grns?${q}` : null);
  const issues = useFetch<Issue[]>(q ? `/registers/material-issues?${q}` : null);
  const transfers = useFetch<Transfer[]>('/registers/transfers');
  const [ledgerOf, setLedgerOf] = useState<string | null>(null);
  const ledger = useFetch<LedgerRow[]>(site && ledgerOf ? `/registers/ledger?projectId=${site}&materialId=${ledgerOf}` : null);
  const [supplier, setSupplier] = useState<string | undefined>();
  const sledger = useFetch<SupplierLedger>(supplier ? `/purchase/supplier-ledger/${supplier}` : null);
  const [paying, setPaying] = useState(false);
  const [payForm] = Form.useForm();
  const m = (id: string) => L.material(id);
  const site_ = (id: string) => String(L.project(id)?.name ?? '');
  const role = useMe()?.user.role;
  const canPrice = role === 'owner' || role === 'store' || role === 'accountant';

  return (
    <Page title="Store & stock" extra={<>
      <SitePicker value={site} onChange={setSite} />
      <DatePicker.RangePicker value={[dayjs(range[0]), dayjs(range[1])]} format="DD MMM" allowClear={false} onChange={(v) => v?.[0] && v[1] && setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])} />
    </>}>
      <Tabs items={[
        {
          key: 'stock', label: 'Stock', children: (
            <>
              <Space style={{ marginBottom: 12 }}>{site ? <Button href={fileUrl(`/reports/stock?projectId=${site}&format=xlsx`)}>Stock statement (Excel)</Button> : null}</Space>
              <Table rowKey="materialId" dataSource={stock.data ?? []} pagination={false} columns={[
                { title: 'Material', dataIndex: 'materialId', render: (v: string) => `${String(m(v)?.nameEn ?? '')} · ${String(m(v)?.nameGu ?? '')}` },
                { title: 'On hand', dataIndex: 'qty', align: 'right', render: (v: number, r: StockRow) => <b>{qty(v)} {String(m(r.materialId)?.unit ?? '')}</b> },
                { title: 'Minimum', dataIndex: 'minStock', align: 'right', render: (v: number | null) => (v == null ? '—' : qty(v)) },
                { key: 'low', render: (_: unknown, r: StockRow) => (r.minStock != null && r.qty < r.minStock ? <Tag color="orange">LOW</Tag> : null) },
                { key: 'l', render: (_: unknown, r: StockRow) => <Button size="small" onClick={() => setLedgerOf(r.materialId)}>Ledger</Button> },
              ]} />
            </>
          ),
        },
        {
          key: 'grn', label: 'Material received (GRN)', children: (
            <>
              <Space style={{ marginBottom: 12 }}>{site ? <Button href={fileUrl(`/reports/grn?projectId=${site}&from=${range[0]}&to=${range[1]}&format=xlsx`)}>GRN register (Excel)</Button> : null}</Space>
              <Table rowKey="id" dataSource={grns.data ?? []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
                { title: 'Date', dataIndex: 'date', render: date },
                { title: 'Supplier', dataIndex: 'supplierId', render: (v: string | null) => String(L.supplier(v)?.name ?? '—') },
                { title: 'Challan', dataIndex: 'challanNo' },
                { title: 'Vehicle', dataIndex: 'vehicleNo' },
                { title: 'Material', dataIndex: 'lines', render: (ls: Grn['lines']) => ls.map((l) => <div key={l.id}>{String(m(l.materialId)?.nameEn ?? '')} {qty(l.qty)} {String(m(l.materialId)?.unit ?? '')}{l.rejectedQty ? <Typography.Text type="danger"> (−{qty(l.rejectedQty)} rejected)</Typography.Text> : null}</div>) },
                { title: 'Rate / unit', dataIndex: 'lines', render: (ls: Grn['lines']) => ls.map((l) => (
                  <div key={l.id}>
                    {canPrice ? (
                      <InputNumber size="small" prefix="₹" min={0} placeholder="rate" defaultValue={l.ratePaise == null ? undefined : l.ratePaise / 100} style={{ width: 120 }}
                        onBlur={(e) => {
                          const v = e.target.value === '' ? null : Math.round(Number(e.target.value.replace(/[^\d.]/g, '')) * 100);
                          if (v === l.ratePaise) return;
                          void patch(`/registers/grn-lines/${l.id}/rate`, { ratePaise: v }).then(() => message.success('Rate saved')).catch((err: unknown) => message.error(errorText(err)));
                        }} />
                    ) : money(l.ratePaise)}
                  </div>
                )) },
                { title: 'Challan photo', dataIndex: 'photos', render: (ps: Grn['photos']) => <Image.PreviewGroup>{ps.filter((p) => p.uploaded).map((p) => <Image key={p.id} width={48} height={48} style={{ objectFit: 'cover' }} src={fileUrl(`/photos/${p.id}/file`)} alt="challan" />)}</Image.PreviewGroup> },
              ]} />
            </>
          ),
        },
        {
          key: 'used', label: 'Material used', children: (
            <Table rowKey="id" dataSource={issues.data ?? []} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
              { title: 'Date', dataIndex: 'date', render: date },
              { title: 'Material', dataIndex: 'materialId', render: (v: string) => String(m(v)?.nameEn ?? '') },
              { title: 'Qty', dataIndex: 'qty', align: 'right', render: (v: number, r: Issue) => `${qty(v)} ${String(m(r.materialId)?.unit ?? '')}` },
            ]} />
          ),
        },
        {
          key: 'tr', label: 'Transfers', children: (
            <Table rowKey="id" dataSource={transfers.data ?? []} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
              { title: 'Sent', dataIndex: 'createdAt', render: (v: string) => date(v) },
              { title: 'From', dataIndex: 'fromProjectId', render: site_ },
              { title: 'To', dataIndex: 'toProjectId', render: site_ },
              { title: 'Material', dataIndex: 'materialId', render: (v: string) => String(m(v)?.nameEn ?? '') },
              { title: 'Qty', dataIndex: 'qty', align: 'right', render: qty },
              { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={v === 'received' ? 'green' : v === 'sent' ? 'gold' : 'default'}>{v === 'sent' ? 'on the way' : v}</Tag> },
            ]} />
          ),
        },
        {
          key: 'sup', label: 'Supplier ledger', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space wrap>
                <Select style={{ width: 280 }} placeholder="Supplier" value={supplier} onChange={setSupplier} showSearch optionFilterProp="label" options={L.suppliers.map((s) => ({ value: s.id, label: String(s.name) }))} />
                {supplier && can('wages', 'C') ? <Button onClick={() => { payForm.setFieldsValue({ date: dayjs(), mode: 'bank' }); setPaying(true); }}>Record payment</Button> : null}
                {supplier ? <Button href={fileUrl(`/reports/supplier-ledger?supplierId=${supplier}&format=xlsx`)}>Excel</Button> : null}
                {sledger.data ? <Typography.Text strong>Due: {money(sledger.data.duePaise)}</Typography.Text> : null}
              </Space>
              <Table rowKey="id" dataSource={sledger.data?.rows ?? []} pagination={false} columns={[
                { title: 'Date', dataIndex: 'date', render: date },
                { title: 'Entry', dataIndex: 'kind', render: (v: string, r) => (v === 'grn' ? `GRN${r.unpricedLines ? ` (${r.unpricedLines} line(s) without a rate)` : ''}` : 'Payment') },
                { title: 'Ref', dataIndex: 'ref' },
                { title: 'Material (Dr)', dataIndex: 'debitPaise', align: 'right', render: (v: number) => (v ? money(v) : '') },
                { title: 'Paid (Cr)', dataIndex: 'creditPaise', align: 'right', render: (v: number) => (v ? money(v) : '') },
                { title: 'Balance', dataIndex: 'balancePaise', align: 'right', render: money },
              ]} />
            </Space>
          ),
        },
      ]} />
      <Drawer open={!!ledgerOf} width={560} title={`Stock ledger · ${String(m(ledgerOf ?? '')?.nameEn ?? '')}`} onClose={() => setLedgerOf(null)}>
        <Table rowKey="id" size="small" pagination={false} dataSource={ledger.data ?? []} columns={[
          { title: 'Date', dataIndex: 'date', render: date },
          { title: 'Source', dataIndex: 'sourceType', render: (v: string) => v.replace('_', ' ') },
          { title: 'In / out', dataIndex: 'qtyDelta', align: 'right', render: (v: number) => <span style={{ color: v < 0 ? '#B91C1C' : undefined }}>{v > 0 ? '+' : ''}{qty(v)}</span> },
          { title: 'Balance', dataIndex: 'balance', align: 'right', render: qty },
        ]} />
      </Drawer>
      <Modal open={paying} title="Payment to supplier" okText="Save" onCancel={() => setPaying(false)} onOk={() => void payForm.validateFields().then(async (v: { amount: number; date: dayjs.Dayjs; mode: string; reference?: string; projectId?: string }) => {
        try {
          await post('/purchase/supplier-payments', { supplierId: supplier, projectId: v.projectId ?? null, amountPaise: Math.round(v.amount * 100), date: v.date.format('YYYY-MM-DD'), mode: v.mode, reference: v.reference ?? null });
          setPaying(false);
          await sledger.reload();
        } catch (e) {
          message.error(errorText(e));
        }
      })}>
        <Form form={payForm} layout="vertical">
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber prefix="₹" min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="date" label="Date"><DatePicker format="DD MMM YYYY" /></Form.Item>
          <Form.Item name="mode" label="Mode"><Select options={[{ value: 'bank', label: 'Bank' }, { value: 'upi', label: 'UPI' }, { value: 'cash', label: 'Cash' }]} /></Form.Item>
          <Form.Item name="projectId" label="Site (optional)"><Select allowClear options={L.projects.map((p) => ({ value: p.id, label: String(p.name) }))} /></Form.Item>
          <Form.Item name="reference" label="Reference (cheque / UTR)"><Input /></Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
