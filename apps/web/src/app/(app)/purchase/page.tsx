'use client';

import { App, Button, Form, InputNumber, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { errorText, post } from '@/lib/api';
import { date, dateTime, money, qty } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useLookups } from '@/lib/masters';
import { useCan } from '@/lib/session';

interface Line { id: string; materialId: string; qty: number; ratePaise?: number }
interface Indent { id: string; status: string; requestedById: string; neededBy: string | null; note: string | null; createdAt: string; lines: Line[] }
interface Po { id: string; poNo: string; supplierId: string; indentId: string | null; status: string; totalPaise: number; createdAt: string; lines: Line[] }
const TONE: Record<string, string> = { submitted: 'gold', pending_approval: 'gold', approved: 'blue', ordered: 'green', sent: 'cyan', received: 'green', partly_received: 'cyan', rejected: 'red', cancelled: 'default', draft: 'default' };

// W7: indents from site → approval → purchase order to a supplier (owner approves above the threshold).
export default function PurchasePage() {
  const { message } = App.useApp();
  const can = useCan();
  const L = useLookups();
  const [site, setSite] = useState<string | undefined>();
  const indents = useFetch<Indent[]>(site ? `/purchase/indents?projectId=${site}` : null);
  const pos = useFetch<Po[]>(site ? `/purchase/pos?projectId=${site}` : null);
  const [poFor, setPoFor] = useState<{ indent?: Indent } | null>(null);
  const [form] = Form.useForm();
  const mat = (id: string) => L.material(id);
  const lines = (ls: Line[]) => ls.map((l) => `${String(mat(l.materialId)?.nameEn ?? '')} ${qty(l.qty)} ${String(mat(l.materialId)?.unit ?? '')}`).join(', ');

  const openPo = (indent?: Indent) => {
    setPoFor({ indent });
    form.setFieldsValue({ supplierId: undefined, lines: indent ? indent.lines.map((l) => ({ materialId: l.materialId, qty: l.qty, rate: undefined })) : [{}] });
  };
  const savePo = async () => {
    const v = (await form.validateFields()) as { supplierId: string; lines: { materialId: string; qty: number; rate: number }[] };
    try {
      const po = await post<Po>('/purchase/pos', { projectId: site, supplierId: v.supplierId, indentId: poFor?.indent?.id ?? null, lines: v.lines.map((l) => ({ materialId: l.materialId, qty: l.qty, ratePaise: Math.round(l.rate * 100) })) });
      message.success(po.status === 'pending_approval' ? `${po.poNo} sent to the owner for approval` : `${po.poNo} approved`);
      setPoFor(null);
      void pos.reload();
      void indents.reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  return (
    <Page title="Indents & purchase orders" extra={<SitePicker value={site} onChange={setSite} />}>
      <Tabs items={[
        {
          key: 'i', label: 'Indents', children: (
            <Table rowKey="id" dataSource={indents.data ?? []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
              { title: 'Raised', dataIndex: 'createdAt', render: dateTime },
              { title: 'By', dataIndex: 'requestedById', render: (v: string) => String(L.user(v)?.name ?? '') },
              { title: 'Material', dataIndex: 'lines', render: lines },
              { title: 'Needed by', dataIndex: 'neededBy', render: date },
              { title: 'Note', dataIndex: 'note' },
              { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={TONE[v]}>{v === 'submitted' ? 'waiting for approval' : v}</Tag> },
              { key: 'a', render: (_: unknown, r: Indent) => (r.status === 'approved' && can('po', 'C') ? <Button size="small" type="primary" onClick={() => openPo(r)}>Make PO</Button> : null) },
            ]} />
          ),
        },
        {
          key: 'p', label: 'Purchase orders', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              {can('po', 'C') ? <Button type="primary" onClick={() => openPo()}>New purchase order</Button> : null}
              <Table rowKey="id" dataSource={pos.data ?? []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 50, hideOnSinglePage: true }} columns={[
                { title: 'PO', dataIndex: 'poNo' },
                { title: 'Date', dataIndex: 'createdAt', render: dateTime },
                { title: 'Supplier', dataIndex: 'supplierId', render: (v: string) => String(L.supplier(v)?.name ?? '') },
                { title: 'Material', dataIndex: 'lines', render: lines },
                { title: 'Total', dataIndex: 'totalPaise', align: 'right', render: money },
                { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={TONE[v]}>{v.replace('_', ' ')}</Tag> },
                {
                  key: 'a', render: (_: unknown, r: Po) => can('po', 'C') && !['rejected', 'cancelled', 'received'].includes(r.status) ? (
                    <Select size="small" placeholder="Update…" style={{ width: 150 }} onChange={(status: string) => void post(`/purchase/pos/${r.id}/status`, { status }).then(pos.reload).catch((e: unknown) => message.error(errorText(e)))}
                      options={[...(r.status === 'approved' ? [{ value: 'sent', label: 'Sent to supplier' }] : []), ...(['sent', 'partly_received'].includes(r.status) ? [{ value: 'partly_received', label: 'Partly received' }, { value: 'received', label: 'Fully received' }] : []), { value: 'cancelled', label: 'Cancel' }]} />
                  ) : null,
                },
              ]} />
            </Space>
          ),
        },
      ]} />
      <Modal open={!!poFor} width={720} title={poFor?.indent ? 'Purchase order from indent' : 'New purchase order'} okText="Create PO" onCancel={() => setPoFor(null)} onOk={() => void savePo()} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={L.suppliers.map((s) => ({ value: s.id, label: String(s.name) }))} /></Form.Item>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline" wrap>
                    <Form.Item name={[f.name, 'materialId']} rules={[{ required: true, message: 'Material' }]}><Select style={{ width: 240 }} placeholder="Material" showSearch optionFilterProp="label" options={L.materials.map((m) => ({ value: m.id, label: `${m.nameEn} (${m.unit})` }))} /></Form.Item>
                    <Form.Item name={[f.name, 'qty']} rules={[{ required: true, message: 'Qty' }]}><InputNumber min={0.001} placeholder="Qty" /></Form.Item>
                    <Form.Item name={[f.name, 'rate']} rules={[{ required: true, message: 'Rate' }]}><InputNumber min={0} prefix="₹" placeholder="Rate per unit" /></Form.Item>
                    <Button type="text" danger onClick={() => remove(f.name)}>✕</Button>
                  </Space>
                ))}
                <Button onClick={() => add({})}>Add line</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Page>
  );
}
