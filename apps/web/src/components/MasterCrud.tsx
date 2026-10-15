'use client';

import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { del, errorText, patch, post } from '../lib/api';
import { useFetch } from '../lib/hooks';

export interface FieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'select' | 'money' | 'date' | 'number' | 'qty';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}
export type MasterRow = { id: string; [k: string]: unknown };

/** List + add/edit/delete for one master list (contractors, materials, rates…), all through /masters/:kind. */
export function MasterCrud({ kind, columns, fields, query = '', defaults = {}, canEdit, addLabel = 'Add', search }: {
  kind: string; columns: ColumnsType<MasterRow>; fields: FieldSpec[]; query?: string; defaults?: Record<string, unknown>; canEdit: boolean; addLabel?: string; search?: (r: MasterRow) => string;
}) {
  const { message } = App.useApp();
  const { data, loading, reload } = useFetch<MasterRow[]>(`/masters/${kind}${query}`);
  const [editing, setEditing] = useState<MasterRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [form] = Form.useForm();

  const open = (row: MasterRow | 'new') => {
    setEditing(row);
    form.setFieldsValue(
      row === 'new'
        ? {}
        : Object.fromEntries(fields.map((f) => [f.name, f.type === 'money' ? Number(row[f.name]) / 100 : f.type === 'date' && row[f.name] ? dayjs(String(row[f.name])) : row[f.name]])),
    );
  };
  const save = async () => {
    const v = (await form.validateFields()) as Record<string, unknown>;
    const body: Record<string, unknown> = { ...defaults };
    for (const f of fields) {
      const x = v[f.name];
      body[f.name] = f.type === 'money' ? Math.round(Number(x) * 100) : f.type === 'date' ? (x ? dayjs(x as string).format('YYYY-MM-DD') : null) : x === undefined ? null : x;
    }
    setSaving(true);
    try {
      if (editing === 'new') await post(`/masters/${kind}`, body);
      else if (editing) await patch(`/masters/${kind}/${editing.id}`, body);
      setEditing(null);
      await reload();
      message.success('Saved');
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const rows = (data ?? []).filter((r) => !q || (search ? search(r) : JSON.stringify(r)).toLowerCase().includes(q.toLowerCase()));

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input.Search allowClear placeholder="Search" onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        {canEdit ? <Button type="primary" onClick={() => open('new')}>{addLabel}</Button> : null}
      </Space>
      <Table<MasterRow>
        rowKey="id"
        size="middle"
        loading={loading && !data}
        dataSource={rows}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        columns={[
          ...columns,
          ...(canEdit
            ? [{
                key: 'actions', width: 140, render: (_: unknown, r: MasterRow) => (
                  <Space>
                    <Button size="small" onClick={() => open(r)}>Edit</Button>
                    <Popconfirm title="Remove this?" onConfirm={() => void del(`/masters/${kind}/${r.id}`).then(reload).catch((e: unknown) => message.error(errorText(e)))}>
                      <Button size="small" danger>Remove</Button>
                    </Popconfirm>
                  </Space>
                ),
              }]
            : []),
        ]}
      />
      <Modal open={!!editing} title={editing === 'new' ? addLabel : 'Edit'} onCancel={() => setEditing(null)} onOk={() => void save()} confirmLoading={saving} okText="Save" destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          {fields.map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={f.required ? [{ required: true, message: `Enter ${f.label.toLowerCase()}` }] : []}>
              {f.type === 'select' ? <Select options={f.options} showSearch optionFilterProp="label" allowClear={!f.required} placeholder={f.placeholder} />
                : f.type === 'money' ? <InputNumber prefix="₹" min={0} style={{ width: '100%' }} />
                : f.type === 'number' ? <InputNumber style={{ width: '100%' }} />
                : f.type === 'qty' ? <InputNumber min={0} step={1} style={{ width: '100%' }} />
                : f.type === 'date' ? <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
                : <Input placeholder={f.placeholder} />}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </Space>
  );
}
