import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Site Diary',
  description: 'Construction site management for builders',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="gu">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
