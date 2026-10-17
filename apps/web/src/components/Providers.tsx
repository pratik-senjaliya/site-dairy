'use client';

import '@ant-design/v5-patch-for-react-19';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { colors, radius } from '@site-diary/ui-tokens';
import { App, ConfigProvider } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { reportError } from '../lib/report-error';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.message, e.error instanceof Error ? e.error.stack : undefined);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: colors.primary,
            colorText: colors.ink,
            colorBgLayout: colors.background,
            colorBorder: colors.border,
            colorSuccess: colors.success,
            colorWarning: colors.warning,
            colorError: colors.danger,
            borderRadius: radius.sm,
            fontSize: 14,
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
