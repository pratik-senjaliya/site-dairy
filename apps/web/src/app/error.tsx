'use client';

import { Button, Result } from 'antd';
import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error.message, error.stack), [error]);
  return (
    <Result status="error" title="Something went wrong on this page" subTitle="It has been reported. Try again, or go back to the dashboard."
      extra={[<Button key="r" type="primary" onClick={reset}>Try again</Button>, <Button key="h" href="/">Dashboard</Button>]} />
  );
}
