function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see apps/api/.env.example)`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
};
