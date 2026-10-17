'use client';

import { ROLES } from '@site-diary/shared';
import { App, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { errorText, patch, post } from '@/lib/api';
import { dateTime, ROLE_LABEL } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useMe } from '@/lib/session';

interface User { id: string; name: string; phone: string; role: string; language: string; isActive: boolean; siteIds: string[]; lastSeenAt: string | null }

// W11: invite by phone number, choose role and sites. The person signs in with an OTP on that number.
export default function UsersPage() {
  const { message } = App.useApp();
  const me = useMe();
  const { data, error, reload } = useFetch<User[]>('/users');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [form] = Form.useForm();
  const role = Form.useWatch('role', form) as string | undefined;
  const sites = me?.projects ?? [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const invite = (u: User) =>
    u.language === 'en'
      ? `Namaste ${u.name}, you are added to ${me?.company.name} on Site Diary. Open ${appUrl} and sign in with this mobile number (${u.phone}); you will get an OTP.`
      : `નમસ્તે ${u.name}, તમને ${me?.company.name} ની સાઇટ ડાયરીમાં ઉમેર્યા છે. ${appUrl} ખોલો અને આ મોબાઇલ નંબર (${u.phone}) થી લોગિન કરો; OTP આવશે.`;

  const save = async () => {
    const v = (await form.validateFields()) as Omit<User, 'id' | 'lastSeenAt'>;
    try {
      if (editing === 'new') await post('/users', v);
      else if (editing) await patch(`/users/${editing.id}`, v);
      setEditing(null);
      await reload();
      message.success('Saved');
    } catch (e) {
      message.error(errorText(e));
    }
  };

  return (
    <Page title="Users & site access" error={error} extra={<Button type="primary" onClick={() => { setEditing('new'); form.setFieldsValue({ role: 'supervisor', language: 'gu', isActive: true, siteIds: [] }); }}>Add person</Button>}>
      <Table rowKey="id" dataSource={data ?? []} pagination={false} scroll={{ x: 'max-content' }} columns={[
        { title: 'Name', dataIndex: 'name' },
        { title: 'Phone', dataIndex: 'phone' },
        { title: 'Role', dataIndex: 'role', render: (r: string) => ROLE_LABEL[r] },
        { title: 'Sites', dataIndex: 'siteIds', render: (ids: string[], u: User) => (u.role === 'owner' || u.role === 'accountant' ? <Typography.Text type="secondary">All sites</Typography.Text> : ids.map((id) => <Tag key={id}>{sites.find((s) => s.id === id)?.name}</Tag>)) },
        { title: 'Language', dataIndex: 'language', render: (l: string) => ({ gu: 'ગુજરાતી', en: 'English', hi: 'हिन्दी' })[l] },
        { title: 'Last seen', dataIndex: 'lastSeenAt', render: dateTime },
        { title: 'Status', dataIndex: 'isActive', render: (a: boolean) => (a ? <Tag color="green">active</Tag> : <Tag>removed</Tag>) },
        {
          key: 'e', render: (_: unknown, u: User) => (
            <Space>
              <Button size="small" onClick={() => { setEditing(u); form.setFieldsValue(u); }}>Edit</Button>
              {u.isActive && u.id !== me?.user.id ? <Button size="small" href={`https://wa.me/${u.phone.replace(/^\+/, '')}?text=${encodeURIComponent(invite(u))}`} target="_blank">Invite on WhatsApp</Button> : null}
            </Space>
          ),
        },
      ]} />
      <Modal open={!!editing} title={editing === 'new' ? 'Add person' : 'Edit person'} okText="Save" onCancel={() => setEditing(null)} onOk={() => void save()} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Mobile number (signs in with OTP)" rules={[{ required: true }]}><Input placeholder="98250 12345" /></Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}><Select options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Form.Item>
          {role !== 'owner' && role !== 'accountant' ? <Form.Item name="siteIds" label="Sites"><Select mode="multiple" options={sites.map((s) => ({ value: s.id, label: s.name }))} /></Form.Item> : null}
          <Form.Item name="language" label="App language"><Select options={[{ value: 'gu', label: 'ગુજરાતી' }, { value: 'hi', label: 'हिन्दी' }, { value: 'en', label: 'English' }]} /></Form.Item>
          <Form.Item name="isActive" label="Can sign in" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
