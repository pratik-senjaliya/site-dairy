'use client';

import { App, Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Row, Space, Switch, Table, Tag, Tree, Typography } from 'antd';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { ProjectForm, TYPE_LABEL, type Project } from '@/components/ProjectForm';
import { del, errorText, post } from '@/lib/api';
import { date, money, ROLE_LABEL } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { useCan, useReloadMe } from '@/lib/session';

interface Node { id: string; parentId: string | null; kind: string; name: string; sort: number }
interface Detail extends Project { structure: Node[]; workItems: { id: string; nameGu: string; nameEn: string; sort: number }[]; team: { id: string; name: string; role: string; phone: string }[] }

// W2: one site — structure tree (bulk "B block, 12 floors"), work items, team.
export default function ProjectPage() {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const reloadMe = useReloadMe();
  const { data, error, reload } = useFetch<Detail>(`/projects/${id}`);
  const [edit, setEdit] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [item, setItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const canEdit = can('projects', 'C');

  const tree = (data?.structure ?? []).filter((n) => !n.parentId).map((t) => ({
    key: t.id, title: <b>{t.name}</b>,
    children: data!.structure.filter((n) => n.parentId === t.id).map((f) => ({ key: f.id, title: f.name, isLeaf: true })),
  }));

  return (
    <Page title={data?.name ?? 'Site'} error={error} extra={canEdit ? <Button onClick={() => setEdit(true)}>Edit site</Button> : null}>
      {data ? (
        <Descriptions bordered size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="Type">{TYPE_LABEL[data.type]}</Descriptions.Item>
          <Descriptions.Item label="Status"><Tag>{data.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="RERA">{data.reraNo ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Start">{date(data.startDate)}</Descriptions.Item>
          <Descriptions.Item label="Planned end">{date(data.endDate)}</Descriptions.Item>
          <Descriptions.Item label="Budget">{money(data.budgetPaise)}</Descriptions.Item>
          <Descriptions.Item label="Address" span={3}>{data.address ?? '—'}</Descriptions.Item>
        </Descriptions>
      ) : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Structure" extra={canEdit ? <Button size="small" onClick={() => setBulk(true)}>Add tower + floors</Button> : null}>
            {tree.length ? <Tree treeData={tree} defaultExpandAll selectable={false} /> : <Typography.Text type="secondary">No towers yet. Add one, e.g. “B block, 12 floors”.</Typography.Text>}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Work items" extra={canEdit ? <Button size="small" onClick={() => setItem(true)}>Add</Button> : null}>
            <Table size="small" rowKey="id" pagination={false} dataSource={data?.workItems ?? []} columns={[
              { title: 'Gujarati', dataIndex: 'nameGu' }, { title: 'English', dataIndex: 'nameEn' },
              ...(canEdit ? [{ key: 'x', width: 40, render: (_: unknown, r: { id: string }) => <Popconfirm title="Remove?" onConfirm={() => void del(`/masters/workItem/${r.id}`).then(reload)}><Button size="small" type="text" danger>✕</Button></Popconfirm> }] : []),
            ]} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Team on this site">
            <Table size="small" rowKey="id" pagination={false} dataSource={data?.team ?? []} locale={{ emptyText: 'Assign people in Users & site access' }} columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Role', dataIndex: 'role', render: (r: string) => ROLE_LABEL[r] }, { title: 'Phone', dataIndex: 'phone' }]} />
          </Card>
        </Col>
      </Row>
      <ProjectForm open={edit} project={data ?? null} onClose={(saved) => { setEdit(false); if (saved) { void reload(); void reloadMe(); } }} />
      <Modal open={bulk} title="Add tower with floors" confirmLoading={busy} okText="Create" onCancel={() => setBulk(false)} destroyOnHidden onOk={() => void (async () => {
        const v = await bulkForm.validateFields();
        setBusy(true);
        try { await post(`/projects/${id}/structure/bulk`, v); setBulk(false); await reload(); } catch (e) { message.error(errorText(e)); } finally { setBusy(false); }
      })()}>
        <Form form={bulkForm} layout="vertical" initialValues={{ floors: 12, basements: 0, ground: true }}>
          <Form.Item name="towerName" label="Tower / block name" rules={[{ required: true }]}><Input placeholder="B block" /></Form.Item>
          <Space>
            <Form.Item name="floors" label="Floors above ground"><InputNumber min={0} max={80} /></Form.Item>
            <Form.Item name="basements" label="Basements"><InputNumber min={0} max={5} /></Form.Item>
            <Form.Item name="ground" label="Ground floor" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
      <Modal open={item} title="Add work item" okText="Add" onCancel={() => setItem(false)} destroyOnHidden onOk={() => void (async () => {
        const v = (await itemForm.validateFields()) as { nameGu: string; nameEn: string };
        try { await post('/masters/workItem', { ...v, projectId: id, sort: (data?.workItems.length ?? 0) + 1 }); setItem(false); await reload(); } catch (e) { message.error(errorText(e)); }
      })()}>
        <Form form={itemForm} layout="vertical">
          <Form.Item name="nameGu" label="Name (Gujarati)" rules={[{ required: true }]}><Input placeholder="વોટરપ્રૂફિંગ" /></Form.Item>
          <Form.Item name="nameEn" label="Name (English)" rules={[{ required: true }]}><Input placeholder="Waterproofing" /></Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
