'use client';

import { colors } from '@site-diary/ui-tokens';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { errorText, post } from '@/lib/api';
import { clearCache } from '@/lib/hooks';

type Verify = { user?: unknown; signup?: boolean; verifiedToken?: string; companies?: { id: string; name: string; role: string }[] };

function deviceId() {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) localStorage.setItem('deviceId', (id = `web-${crypto.randomUUID()}`));
    return id;
  } catch {
    return `web-${crypto.randomUUID()}`;
  }
}

function Login() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';
  const [step, setStep] = useState<'phone' | 'otp' | 'company' | 'signup'>('phone');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<Verify | null>(null);
  const device = { deviceId: deviceId(), deviceName: 'Web panel' };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const done = () => {
    clearCache();
    router.replace(next.startsWith('/') ? next : '/');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: colors.background, padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={2} style={{ margin: 0, color: colors.primary }}>Site Diary</Typography.Title>
            <Typography.Text type="secondary">Office panel · સાઇટ ડાયરી</Typography.Text>
          </div>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {step === 'phone' && (
            <Form layout="vertical" onFinish={() => run(async () => { await post('/auth/otp/request', { phone }); setStep('otp'); })}>
              <Form.Item label="Mobile number" required>
                <Input size="large" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98250 12345" inputMode="tel" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>Send OTP</Button>
            </Form>
          )}
          {step === 'otp' && (
            <Form layout="vertical" onFinish={(v: { code: string }) => run(async () => {
              const r = await post<Verify>('/auth/otp/verify', { phone, code: v.code, ...device });
              if (r.user) return done();
              setVerified(r);
              setStep(r.signup ? 'signup' : 'company');
            })}>
              <Typography.Paragraph type="secondary">We sent a 6-digit code to {phone}.</Typography.Paragraph>
              <Form.Item name="code" label="Code" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Enter the 6-digit code' }]}>
                <Input size="large" autoFocus inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={busy}>Sign in</Button>
              <Button type="link" block onClick={() => setStep('phone')}>Change number</Button>
            </Form>
          )}
          {step === 'company' && (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text strong>Which company?</Typography.Text>
              {verified?.companies?.map((c) => (
                <Button key={c.id} block size="large" loading={busy} onClick={() => run(async () => { await post('/auth/login', { verifiedToken: verified.verifiedToken, companyId: c.id, ...device }); done(); })}>{c.name}</Button>
              ))}
            </Space>
          )}
          {step === 'signup' && (
            <Form layout="vertical" onFinish={(v: { companyName: string; name: string }) => run(async () => { await post('/auth/signup', { verifiedToken: verified?.verifiedToken, ...v, language: 'gu', ...device }); done(); })}>
              <Typography.Paragraph type="secondary">This number has no login yet. Start your company here, or ask your owner to add you.</Typography.Paragraph>
              <Form.Item name="companyName" label="Company name" rules={[{ required: true, min: 2 }]}><Input size="large" /></Form.Item>
              <Form.Item name="name" label="Your name" rules={[{ required: true, min: 2 }]}><Input size="large" /></Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={busy}>Start</Button>
            </Form>
          )}
        </Space>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
