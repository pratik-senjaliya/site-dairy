// Drives every office page as the demo owner and checks each one renders without errors.
// Needs: API on :4000 (seeded demo, OTP_DEV_CODE=123456) and the web panel on :3000.
//   node e2e/web.mjs [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const out = process.argv[2] ?? 'e2e/.out';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
page.on('response', (r) => { if (r.url().includes('/api/v1/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

async function signIn(phone) {
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('98250 12345').fill(phone);
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Today across sites').waitFor({ timeout: 20000 });
}

const PAGES = [
  ['/', 'Today across sites', 'Shivam Heights'],
  ['/approvals', 'Approvals', 'Material indent'],
  ['/projects', 'Sites', 'Shivam Heights'],
  ['/contractors', 'Contractors & labour', 'Bharat Construction'],
  ['/attendance', 'Attendance register', 'Workers'],
  ['/wages', 'Wages & advances', 'New settlement'],
  ['/materials', 'Materials & suppliers', 'Cement'],
  ['/purchase', 'Indents & purchase orders', 'Indents'],
  ['/store', 'Store & stock', 'On hand'],
  ['/progress', 'Progress & photos', 'B block'],
  ['/reports', 'Reports & exports', 'દૈનિક સાઇટ રિપોર્ટ'],
  ['/users', 'Users & site access', 'Kanubhai Rathod'],
  ['/settings', 'Settings', 'Nightly report time'],
  ['/audit', 'Audit log', 'login'],
  ['/import', 'Bulk import', 'Download the contractor template'],
];

// A fresh indent from the supervisor, so there is always something to approve.
async function raiseIndent() {
  const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
  const login = await fetch(`${API}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'mobile' }, body: JSON.stringify({ phone: '+919800000003', code: '123456', deviceId: 'e2e-web-device' }) }).then((r) => r.json());
  const call = (method, path, body) => fetch(API + path, { method, headers: { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json', 'x-client': 'mobile' }, body: body && JSON.stringify(body) }).then((r) => r.json());
  const pull = await call('GET', '/sync/pull');
  const site = pull.changes.project[0].id;
  const cement = pull.changes.material.find((m) => m.nameEn === 'Cement').id;
  const id = crypto.randomUUID();
  await call('POST', '/sync/push', { changes: { indent: [{ id, projectId: site, status: 'submitted' }], indentLine: [{ id: crypto.randomUUID(), indentId: id, materialId: cement, qty: 120 }] } });
}

let failed = 0;
try {
  await raiseIndent();
  await signIn('9800000001');
  for (const [path, title, expect] of PAGES) {
    process.stdout.write(`• ${path} … `);
    try {
      await page.goto(WEB + path);
      await page.getByRole('heading', { name: title }).waitFor({ timeout: 15000 });
      await page.getByText(expect).first().waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${out}/web${path.replace(/\//g, '_') || '_home'}.png`, fullPage: false });
      console.log('ok');
    } catch (e) {
      failed++;
      console.log(`FAIL ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: `${out}/web-fail${path.replace(/\//g, '_')}.png` });
    }
  }
  process.stdout.write('• approve the seeded indent … ');
  await page.goto(`${WEB}/approvals`);
  await page.getByRole('button', { name: 'Approve', exact: true }).first().waitFor();
  const before = await page.getByRole('button', { name: 'Approve', exact: true }).count();
  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await page.getByText('Approved').first().waitFor();
  for (let i = 0; (await page.getByRole('button', { name: 'Approve', exact: true }).count()) !== before - 1; i++) {
    if (i > 50) throw new Error('approval did not leave the list');
    await page.waitForTimeout(200);
  }
  console.log('ok');
  process.stdout.write('• make a PO from it … ');
  await page.goto(`${WEB}/purchase`);
  await page.getByRole('button', { name: 'Make PO' }).first().click();
  await page.locator('.ant-modal .ant-select').first().click();
  await page.getByTitle('Umiya Cement Traders').click();
  const rates = page.locator('.ant-modal input[placeholder="Rate per unit"]');
  for (let i = 0; i < (await rates.count()); i++) await rates.nth(i).fill(i === 0 ? '375' : '62');
  await page.getByRole('button', { name: 'Create PO' }).click();
  await page.getByText(/sent to the owner for approval|approved/).first().waitFor();
  console.log('ok');
  if (errors.length) throw new Error(errors.join('\n'));
  if (failed) throw new Error(`${failed} page(s) failed`);
  console.log('PASS');
} catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
