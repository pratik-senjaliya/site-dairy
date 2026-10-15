import { config } from './config';

/** Sends a login code. Dev: printed in the API log. MSG91: SMS through the OTP API with our code. */
export async function sendOtp(phone: string, code: string): Promise<void> {
  if (config.otpProvider === 'dev') {
    console.log(`[otp] ${phone}: ${code}${config.otpDevCode ? ` (or ${config.otpDevCode})` : ''}`);
    return;
  }
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', config.msg91.templateId);
  url.searchParams.set('mobile', phone.replace(/^\+/, ''));
  url.searchParams.set('otp', code);
  const res = await fetch(url, { method: 'POST', headers: { authkey: config.msg91.authKey, 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (!res.ok || body.type === 'error') throw new Error(`MSG91: ${body.message ?? res.status}`);
}
