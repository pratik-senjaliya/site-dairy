'use client';

import { t } from '@site-diary/i18n';
import { Card, Descriptions, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

interface Health {
  status: string;
  database: string;
  today: string;
}

// Phase 0 check page: proves web → proxy → API → Postgres. Replaced by the dashboard (W1).
export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <Typography.Title>{t('gu', 'app.name')}</Typography.Title>
      <Card title="System status">
        <Descriptions column={1}>
          <Descriptions.Item label="API">
            {error ? <Tag color="error">down</Tag> : health ? <Tag color="success">{health.status}</Tag> : 'checking…'}
          </Descriptions.Item>
          <Descriptions.Item label="Database">
            {health ? <Tag color={health.database === 'up' ? 'success' : 'error'}>{health.database}</Tag> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Site date (Asia/Kolkata)">{health?.today ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </main>
  );
}
