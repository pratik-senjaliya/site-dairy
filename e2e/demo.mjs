// The demo build (EXPO_PUBLIC_DEMO=1) on its own: no API at all. Supervisor enters, owner sees and approves.
//   node e2e/demo.mjs [appUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const APP = process.argv[2] ?? 'http://localhost:8090';
const OUT = process.argv[3] ?? 'e2e/.out';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const apiCalls = [];
await ctx.route(/wa\.me/, (r) => r.abort());
await ctx.route(/:4000\//, (r) => { apiCalls.push(`${r.request().url()} ${r.request().postData() ?? ''}`); return r.abort(); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => void d.accept());
const step = async (n, fn) => { process.stdout.write(`• ${n} … `); await fn(); console.log('ok'); };
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
try {
  await step('demo login screen', async () => {
    await page.goto(APP);
    await page.getByText('ડેમો જુઓ — ઇન્ટરનેટ વગર').waitFor();
    await shot('demo-01-login');
  });
  await step('supervisor: home with the demo site', async () => {
    await page.getByRole('button', { name: 'સુપરવાઇઝર', exact: true }).click();
    await page.getByText('Shivam Heights').first().waitFor({ timeout: 15000 });
    await page.getByLabel('બધું મોકલાઈ ગયું', { exact: true }).first().waitFor({ timeout: 15000 });
    await shot('demo-02-supervisor-home');
  });
  let total = 0;
  await step('supervisor: attendance from the last day, saved', async () => {
    await page.getByText('હાજરી', { exact: true }).last().click();
    await page.getByText(/^\d+ માણસ: /).last().waitFor();
    total = Number((await page.getByText(/^\d+ માણસ: /).last().textContent()).match(/^(\d+) માણસ/)[1]);
    await shot('demo-03-attendance');
    await page.getByText('સેવ કરો', { exact: true }).click();
    await page.getByText(`${total} માણસ`).filter({ visible: true }).first().waitFor();
  });
  await step('supervisor: material request sent', async () => {
    await page.getByText(`${total} માણસ`).filter({ visible: true }).first().waitFor();
    await page.getByText('માલની માંગણી', { exact: true }).click();
    await page.getByRole('button', { name: 'રેતી', exact: true }).click();
    await page.getByRole('textbox', { name: 'જથ્થો' }).first().fill('6');
    await page.getByText('મંજૂરી માટે મોકલો').click();
    await page.getByLabel('બધું મોકલાઈ ગયું', { exact: true }).first().waitFor({ timeout: 15000 });
  });
  await step('switch to the owner', async () => {
    await page.getByText('પ્રોફાઇલ', { exact: true }).filter({ visible: true }).click();
    await page.getByText('બીજી વ્યક્તિ તરીકે જુઓ').click();
    await page.getByRole('button', { name: 'માલિક', exact: true }).click();
    await page.getByText(`${total} માણસ`).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await shot('demo-04-owner-dashboard');
  });
  await step('owner: approves both requests and orders each from a supplier', async () => {
    await page.getByText('મંજૂરી', { exact: true }).filter({ visible: true }).last().click();
    await page.getByText('મંજૂર', { exact: true }).first().waitFor();
    await shot('demo-05-owner-approvals');
    for (let i = 0; i < 2; i++) {
      await page.getByText('મંજૂર', { exact: true }).filter({ visible: true }).first().click();
      // An approved request goes straight on to the order: pick the supplier, send on WhatsApp.
      await page.getByText('કોને ઓર્ડર આપવો?').filter({ visible: true }).waitFor({ timeout: 15000 });
      await page.getByText('Shakti Steel', { exact: true }).filter({ visible: true }).first().click();
      await page.getByText(/^ઓર્ડર: Shakti Steel — /).filter({ visible: true }).waitFor();
      if (i === 0) await shot('demo-05b-order');
      await page.getByRole('button', { name: 'ઓર્ડર કરો અને WhatsApp પર મોકલો' }).filter({ visible: true }).click();
      await page.getByText('કોને ઓર્ડર આપવો?').filter({ visible: true }).waitFor({ state: 'hidden', timeout: 15000 });
    }
    await page.getByText('તમારી મંજૂરી માટે કંઈ બાકી નથી').waitFor();
  });
  await step('owner: site detail', async () => {
    await page.getByRole('button', { name: 'પાછા' }).filter({ visible: true }).click();
    await page.getByText('Shivam Heights', { exact: true }).filter({ visible: true }).last().click();
    await page.getByText('માણસ, છેલ્લા 14 દિવસ').waitFor();
    await shot('demo-06-owner-site');
  });
  if (apiCalls.length) throw new Error(`demo called the API: ${apiCalls[0]}`);
  if (errors.length) throw new Error(errors.join(' | '));
  console.log('PASS (no server used)');
} catch (e) {
  await shot('demo-zz-failure').catch(() => {});
  console.error('\nFAIL', e.message, errors);
  process.exitCode = 1;
} finally {
  await b.close();
}
