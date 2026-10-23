function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see apps/api/.env.example)`);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  databaseUrl: required('DATABASE_URL'),
  /** Session connection for pg-boss (it holds connections and uses LISTEN, which a transaction pooler breaks). */
  directUrl: process.env.DIRECT_URL ?? required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  /** Browser origins allowed to call the API directly (comma-separated): the web panel and the phone app's browser build. */
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:8081').split(',').map((s) => s.trim()).filter(Boolean),
  /** Public address of the web panel, used in report links sent on WhatsApp. */
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
  jwtSecret: isProd ? required('JWT_SECRET') : (process.env.JWT_SECRET ?? 'dev-only-secret-change-me'),
  accessMinutes: 15,
  refreshDays: Number(process.env.REFRESH_DAYS ?? 60),
  cookieSecure: process.env.COOKIE_SECURE === 'true' || isProd,
  trustProxy: process.env.TRUST_PROXY ?? 'loopback',
  /** dev: the code is printed in the API log (and OTP_DEV_CODE, if set, always works). msg91: real SMS. */
  otpProvider: (process.env.OTP_PROVIDER ?? 'dev') as 'dev' | 'msg91',
  otpDevCode: process.env.OTP_DEV_CODE,
  msg91: { authKey: process.env.MSG91_AUTH_KEY ?? '', templateId: process.env.MSG91_TEMPLATE_ID ?? '' },
  /** Who may create a new company: SIGNUP_OPEN=true (anyone, default), false (nobody), or a comma-separated list of numbers (closed pilot). */
  signupOpen: process.env.SIGNUP_OPEN ?? 'true',
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    localDir: process.env.STORAGE_DIR ?? 'uploads',
    bucket: process.env.S3_BUCKET ?? '',
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    template: process.env.WHATSAPP_TEMPLATE ?? 'nightly_report',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'gu',
  },
  runJobs: process.env.RUN_JOBS !== 'false',
  sentryDsn: process.env.SENTRY_DSN,
};

if (isProd && config.otpProvider === 'dev' && !process.env.ALLOW_DEV_OTP) {
  throw new Error('OTP_PROVIDER=dev in production: set OTP_PROVIDER=msg91, or ALLOW_DEV_OTP=true for a demo');
}

/** Whether this verified number (+91…) may start a new company. */
export function canSignUp(phone: string) {
  const v = config.signupOpen.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v.split(',').some((n) => n.replace(/\D/g, '').slice(-10) === phone.slice(-10));
}
