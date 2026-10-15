'use client';

import { App, Button, Card, Descriptions, Form, Input, InputNumber, Select, TimePicker, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { Page } from '@/components/Page';
import { errorText, patch } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useCan, useReloadMe } from '@/lib/session';

interface Company { name: string; gstin: string | null; logoUrl: string | null; plan: string; settings: { reportTime: string; noEntryCutoff: string; poApprovalAbovePaise: number; wageDay: number; labourAlertPercent: number; language: string }; usage: { activeSites: number; activeUsers: number } }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// W12: company, thresholds, report time, language, plan.
export default function SettingsPage() {
  const { message } = App.useApp();
  const can = useCan();
  const reloadMe = useReloadMe();
  const { data, reload } = useFetch<Company>('/company');
  const [form] = Form.useForm();
  const editable = can('users', 'C');
  useEffect(() => {
    if (data) form.setFieldsValue({ ...data, settings: { ...data.settings, reportTime: dayjs(data.settings.reportTime, 'HH:mm'), noEntryCutoff: dayjs(data.settings.noEntryCutoff, 'HH:mm'), poApproval: data.settings.poApprovalAbovePaise / 100 } });
  }, [data, form]);

  const save = async () => {
    const v = (await form.validateFields()) as { name: string; gstin?: string; settings: { reportTime: dayjs.Dayjs; noEntryCutoff: dayjs.Dayjs; poApproval: number; wageDay: number; labourAlertPercent: number; language: string } };
    try {
      await patch('/company', {
        name: v.name, gstin: v.gstin ?? null, logoUrl: data?.logoUrl ?? null,
        settings: { reportTime: v.settings.reportTime.format('HH:mm'), noEntryCutoff: v.settings.noEntryCutoff.format('HH:mm'), poApprovalAbovePaise: Math.round(v.settings.poApproval * 100), wageDay: v.settings.wageDay, labourAlertPercent: v.settings.labourAlertPercent, language: v.settings.language },
      });
      message.success('Saved');
      await reload();
      await reloadMe();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  return (
    <Page title="Settings" extra={editable ? <Button type="primary" onClick={() => void save()}>Save</Button> : null}>
      <Form form={form} layout="vertical" disabled={!editable} style={{ maxWidth: 640 }}>
        <Card title="Company" style={{ marginBottom: 16 }}>
          <Form.Item name="name" label="Company name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="gstin" label="GSTIN (optional)"><Input /></Form.Item>
        </Card>
        <Card title="Reports and alerts" style={{ marginBottom: 16 }}>
          <Form.Item name={['settings', 'reportTime']} label="Nightly report time"><TimePicker format="HH:mm" minuteStep={15} /></Form.Item>
          <Form.Item name={['settings', 'noEntryCutoff']} label="Remind supervisors if no attendance by"><TimePicker format="HH:mm" minuteStep={15} /></Form.Item>
          <Form.Item name={['settings', 'labourAlertPercent']} label="Flag labour change vs 7-day average above (%)"><InputNumber min={5} max={100} /></Form.Item>
          <Form.Item name={['settings', 'wageDay']} label="Weekly wage settlement day"><Select options={DAYS.map((d, i) => ({ value: i, label: d }))} /></Form.Item>
        </Card>
        <Card title="Approvals" style={{ marginBottom: 16 }}>
          <Form.Item name={['settings', 'poApproval']} label="Purchase orders above this need the owner's approval"><InputNumber prefix="₹" min={0} style={{ width: 220 }} /></Form.Item>
        </Card>
        <Card title="Language" style={{ marginBottom: 16 }}>
          <Form.Item name={['settings', 'language']} label="Default for new people"><Select options={[{ value: 'gu', label: 'ગુજરાતી' }, { value: 'hi', label: 'हिन्दी' }, { value: 'en', label: 'English' }]} /></Form.Item>
        </Card>
      </Form>
      {data ? (
        <Card title="Subscription" style={{ maxWidth: 640 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Plan">{data.plan}</Descriptions.Item>
            <Descriptions.Item label="Active sites">{data.usage.activeSites}</Descriptions.Item>
            <Descriptions.Item label="People who can sign in">{data.usage.activeUsers}</Descriptions.Item>
          </Descriptions>
          <Typography.Text type="secondary">Pilot: free for 60 days, up to 2 sites. Billing is not built yet.</Typography.Text>
        </Card>
      ) : null}
    </Page>
  );
}
