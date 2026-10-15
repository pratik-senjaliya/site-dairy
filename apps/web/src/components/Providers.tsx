'use client';

import '@ant-design/v5-patch-for-react-19';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { colors, radius } from '@site-diary/ui-tokens';
import { App, ConfigProvider } from 'antd';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
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
