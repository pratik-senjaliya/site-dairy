'use client';

import { Alert, Space, Typography } from 'antd';
import { useEffect, type ReactNode } from 'react';

export function Page({ title, extra, children, error }: { title: string; extra?: ReactNode; children: ReactNode; error?: string | null }) {
  useEffect(() => {
    document.title = `${title} · Site Diary`;
  }, [title]);
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{title}</Typography.Title>
        <Space wrap>{extra}</Space>
      </div>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {children}
    </Space>
  );
}
