// The other roles: store keeper on the phone, accountant and engineer on the web.
// Needs the same servers as phone.mjs and web.mjs.   node e2e/roles.mjs [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const out = process.argv[2] ?? 'e2e/.out';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};
const apiAs = async (phone) => {
  const r = await fetch(`${API}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'mobile' }, body: JSON.stringify({ phone, code: '123456', deviceId: 'e2e-roles-device' }) });
  const { accessToken } = await r.json();
  return (path) => fetch(API + path, { headers: { authorization: `Bearer ${accessToken}`, 'x-client': 'mobile' } }).then((x) => x.json());
};

try {
  const phone = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => errors.push(e.message));
  phone.on('dialog', (d) => void d.accept());

  await step('store keeper: home has material tiles but no attendance', async () => {
    await phone.goto(APP);
    await phone.locator('input').first().fill('9800000004');
    await phone.getByText('OTP મોકલો').click();
    await phone.getByText('ખાતરી કરો').waitFor(); // the code screen has replaced the phone screen
    await phone.locator('input').first().fill('123456');
    await phone.getByText('ખાતરી કરો').click();
    await phone.getByLabel('બધું મોકલાઈ ગયું', { exact: true }).first().waitFor({ timeout: 20000 });
    await phone.getByText('માલ આવ્યો', { exact: true }).waitFor();
    if (await phone.getByText('હાજરી', { exact: true }).count()) throw new Error('store keeper sees attendance');
    await phone.screenshot({ path: `${out}/roles-store-home.png` });
  });

  let challan = '';
  await step('store keeper: a wrong GRN is deleted from today’s list and the office sees it gone', async () => {
    challan = `DEL-${Date.now() % 100000}`;
    await phone.getByText('માલ આવ્યો', { exact: true }).click();
    await phone.locator('input').nth(0).fill(challan);
    await phone.getByText('રેતી', { exact: true }).click();
    await phone.getByRole('textbox', { name: 'જથ્થો' }).first().fill('2');
    await phone.getByText(/^સેવ કરો/).last().click();
    await phone.getByLabel('બધું મોકલાઈ ગયું', { exact: true }).first().waitFor({ timeout: 20000 });
    await phone.getByText('માલ આવ્યો', { exact: true }).click();
    const row = phone.getByText(challan, { exact: false });
    await row.first().waitFor();
    await phone.screenshot({ path: `${out}/roles-store-today.png` });
    const before = await phone.getByText('કાઢી નાખો', { exact: true }).count();
    await phone.getByText('કાઢી નાખો', { exact: true }).last().click();
    await phone.getByText('આ એન્ટ્રી કાઢી નાખવી છે?').waitFor(); // the app's own confirm dialog
    await phone.getByText('કાઢી નાખો', { exact: true }).last().click();
    for (let i = 0; (await phone.getByText('કાઢી નાખો', { exact: true }).count()) !== before - 1; i++) {
      if (i > 50) throw new Error('entry not removed');
      await phone.waitForTimeout(200);
    }
    await phone.getByRole('button', { name: 'પાછા' }).click();
    await phone.getByLabel('બધું મોકલાઈ ગયું', { exact: true }).first().waitFor({ timeout: 20000 });
    const owner = await apiAs('+919800000001');
    const site = (await owner('/projects'))[0];
    const d = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const grns = await owner(`/registers/grns?projectId=${site.id}&from=${d}&to=${d}`);
    if (grns.some((g) => g.challanNo === challan)) throw new Error('office still has the deleted GRN');
  });

  const web = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  web.on('pageerror', (e) => errors.push(e.message));
  const signIn = async (p) => {
    await web.context().clearCookies();
    await web.goto(`${WEB}/login`);
    await web.getByPlaceholder('98250 12345').fill(p);
    await web.getByRole('button', { name: 'Send OTP' }).click();
    await web.getByLabel('Code').fill('123456');
    await web.getByRole('button', { name: 'Sign in' }).click();
    await web.getByText('Today across sites').waitFor({ timeout: 20000 });
  };

  await step('accountant: wages, store and reports, but no users, audit or approvals', async () => {
    await signIn('9800000005');
    const menu = await web.locator('.ant-menu').innerText();
    for (const hidden of ['Users & site access', 'Audit log', 'Bulk import', 'Approvals']) if (menu.includes(hidden)) throw new Error(`accountant sees ${hidden}`);
    for (const shown of ['Wages & advances', 'Store & stock', 'Reports & exports']) if (!menu.includes(shown)) throw new Error(`accountant misses ${shown}`);
    await web.goto(`${WEB}/users`);
    await web.waitForTimeout(1500);
    await web.goto(`${WEB}/store`);
    await web.getByText('Material received (GRN)').click();
    await web.locator('input[placeholder="rate"]').first().waitFor();
    await web.screenshot({ path: `${out}/roles-accountant-grn.png` });
  });

  await step('engineer: corrects a past attendance cell; the owner gets told', async () => {
    await signIn('9800000002');
    await web.goto(`${WEB}/attendance`);
    await web.getByText('Workers', { exact: true }).waitFor();
    const cell = web.locator('td button').first();
    await cell.click();
    await web.locator('.ant-modal input').first().fill('3');
    await web.getByRole('button', { name: 'Save' }).click();
    await web.getByText(/Saved|Sent for approval/).first().waitFor();
    const owner = await apiAs('+919800000001');
    const n = await owner('/notifications');
    if (!n.items.some((x) => x.title.includes('હાજરી બદલી'))) throw new Error('owner was not told about the late edit');
  });

  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('PASS');
} catch (e) {
  console.error('\nFAIL', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
