'use client';

import { PROJECT_TYPES } from '@site-diary/shared';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { errorText, patch, post } from '@/lib/api';

export interface Project { id: string; name: string; address: string | null; reraNo: string | null; startDate: string | null; endDate: string | null; budgetPaise: number | null; type: string; status: string }
export const TYPE_LABEL: Record<string, string> = { rcc_frame: 'RCC frame', load_bearing: 'Load-bearing', bungalow: 'Bungalow' };

export function ProjectForm({ open, project, onClose }: { open: boolean; project: Project | null; onClose: (saved: boolean) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = (await form.validateFields()) as Record<string, unknown> & { startDate?: dayjs.Dayjs; endDate?: dayjs.Dayjs; budget?: number };
    const body = { name: v.name, address: v.address ?? null, reraNo: v.reraNo ?? null, type: v.type, status: v.status ?? 'active', startDate: v.startDate?.format('YYYY-MM-DD') ?? null, endDate: v.endDate?.format('YYYY-MM-DD') ?? null, budgetPaise: v.budget == null ? null : Math.round(v.budget * 100) };
    setBusy(true);
    try {
      if (project) await patch(`/projects/${project.id}`, body);
      else await post('/projects', body);
      onClose(true);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} title={project ? 'Edit site' : 'New site'} onCancel={() => onClose(false)} onOk={() => void save()} confirmLoading={busy} okText="Save" destroyOnHidden
      afterOpenChange={(o) => o && form.setFieldsValue(project ? { ...project, startDate: project.startDate ? dayjs(project.startDate) : null, endDate: project.endDate ? dayjs(project.endDate) : null, budget: project.budgetPaise == null ? null : project.budgetPaise / 100 } : { type: 'rcc_frame', status: 'active' })}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Site name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="type" label="Type (sets the work items)" rules={[{ required: true }]}><Select options={PROJECT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} disabled={!!project} /></Form.Item>
        <Form.Item name="reraNo" label="RERA number (optional)"><Input /></Form.Item>
        <Form.Item name="startDate" label="Start"><DatePicker format="DD MMM YYYY" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="endDate" label="Planned end"><DatePicker format="DD MMM YYYY" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="budget" label="Budget"><InputNumber prefix="₹" min={0} style={{ width: '100%' }} /></Form.Item>
        {project ? <Form.Item name="status" label="Status"><Select options={[{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }, { value: 'completed', label: 'Completed' }]} /></Form.Item> : null}
      </Form>
    </Modal>
  );
}

