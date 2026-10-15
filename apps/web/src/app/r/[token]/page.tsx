'use client';

import { colors } from '@site-diary/ui-tokens';
import { Alert, Button, Card, Col, Row, Spin, Statistic, Table, Typography } from 'antd';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { qty } from '@/lib/format';

interface Report { title: string; company: string; subtitle: string; highlights: { label: string; value: string }[]; tables: { title: string; columns: { key: string; header: string; fmt?: string }[]; rows: Record<string, unknown>[] }[] }

// The WhatsApp link: the owner reads tonight's report without signing in (the link itself is the permission).
export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/v1/public/reports/${token}`)
      .then(async (r) => (r.ok ? setData((await r.json()) as Report) : setError('This report link has expired.')))
      .catch(() => setError('Could not load the report.'));
  }, [token]);
  return (
    <div style={{ background: colors.background, minHeight: '100vh', padding: 16 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {error ? <Alert type="error" message={error} /> : !data ? <Spin /> : (
          <>
            <Typography.Text type="secondary">{data.company}</Typography.Text>
            <Typography.Title level={2} style={{ margin: '4px 0' }}>{data.title}</Typography.Title>
            <Typography.Text type="secondary">{data.subtitle}</Typography.Text>
            <Row gutter={[12, 12]} style={{ margin: '16px 0' }}>{data.highlights.map((h) => <Col key={h.label} xs={8} md={4}><Card size="small"><Statistic title={h.label} value={h.value} /></Card></Col>)}</Row>
            {data.tables.map((t, i) => (
              <Card key={i} size="small" title={t.title} style={{ marginBottom: 12 }}>
                <Table size="small" pagination={false} rowKey={(_, idx) => String(idx)} dataSource={t.rows} scroll={{ x: 'max-content' }}
                  columns={t.columns.map((c) => ({ title: c.header, dataIndex: c.key, align: ['int', 'qty'].includes(c.fmt ?? '') ? 'right' as const : 'left' as const, render: (v: unknown) => (v == null ? '' : ['int', 'qty'].includes(c.fmt ?? '') ? qty(Number(v)) : String(v)) }))} />
              </Card>
            ))}
            <Button href={`/api/v1/public/reports/${token}/pdf`} target="_blank">Download PDF</Button>
          </>
        )}
      </div>
    </div>
  );
}
