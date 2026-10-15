'use client';

import { App, Alert, Button, Card, Segmented, Space, Table, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { api, errorText, fileUrl } from '@/lib/api';

type Kind = 'contractor' | 'material' | 'supplier' | 'worker';
interface Result { total: number; ok: number; imported: number; rows: { row: number; data: Record<string, unknown>; error: string | null }[] }

// W14: download a template, fill it in Excel, upload, check, import.
export default function ImportPage() {
  const { message } = App.useApp();
  const [kind, setKind] = useState<Kind>('contractor');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (commit: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api<Result>('POST', `/import/${kind}${commit ? '?commit=1' : ''}`, await file.arrayBuffer());
      setResult(r);
      if (commit) message.success(`Imported ${r.imported} rows`);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Bulk import">
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Segmented value={kind} onChange={(v) => { setKind(v as Kind); setResult(null); setFile(null); }} options={[{ value: 'contractor', label: 'Contractors' }, { value: 'worker', label: 'Workers' }, { value: 'material', label: 'Materials' }, { value: 'supplier', label: 'Suppliers' }]} />
          <Typography.Text>1. <a href={fileUrl(`/import/${kind}/template`)}>Download the {kind} template</a> and fill it in Excel (one row per {kind}).</Typography.Text>
          <Space>
            <Typography.Text>2.</Typography.Text>
            <Upload accept=".xlsx" maxCount={1} beforeUpload={(f) => { setFile(f); setResult(null); return false; }} onRemove={() => setFile(null)} fileList={file ? [{ uid: '1', name: file.name, status: 'done' }] : []}>
              <Button>Choose the filled file</Button>
            </Upload>
            <Button disabled={!file} loading={busy} onClick={() => void send(false)}>Check</Button>
          </Space>
          {result ? (
            <>
              <Alert type={result.ok === result.total ? 'success' : 'warning'} showIcon message={`${result.ok} of ${result.total} rows are ready${result.imported ? ` · ${result.imported} imported` : ''}`} />
              <Table size="small" rowKey="row" pagination={false} dataSource={result.rows} scroll={{ x: 'max-content' }} columns={[
                { title: 'Row', dataIndex: 'row' },
                { title: 'Data', dataIndex: 'data', render: (d: Record<string, unknown>) => Object.values(d).filter(Boolean).filter((v) => typeof v === 'string' && v.length < 60).join(' · ') },
                { title: 'Check', dataIndex: 'error', render: (e: string | null) => (e ? <Typography.Text type="danger">{e}</Typography.Text> : <Tag color="green">ok</Tag>) },
              ]} />
              {!result.imported ? <Button type="primary" disabled={!result.ok} loading={busy} onClick={() => void send(true)}>3. Import {result.ok} rows</Button> : null}
            </>
          ) : null}
        </Space>
      </Card>
    </Page>
  );
}
