// Drives the phone app (browser build) as the demo supervisor on a 375 px screen.
// Needs: API on :4000 (seeded demo, OTP_DEV_CODE=123456) and the web export of apps/mobile on :8081.
//   node e2e/phone.mjs [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const out = process.argv[2] ?? 'e2e/.out';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => void d.accept());
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};

async function apiAs(phone) {
  const r = await fetch(`${API}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'mobile' }, body: JSON.stringify({ phone, code: '123456', deviceId: 'e2e-check-device' }) });
  const { accessToken } = await r.json();
  return (path) => fetch(API + path, { headers: { authorization: `Bearer ${accessToken}`, 'x-client': 'mobile' } }).then((x) => x.json());
}

try {
  await step('login screen in Gujarati', async () => {
    await page.goto(APP);
    await page.getByText('OTP મોકલો').waitFor();
    await shot('01-login');
  });
  await step('phone + OTP sign-in as supervisor', async () => {
    await page.locator('input').first().fill('9800000003');
    await page.getByText('OTP મોકલો').click();
    await page.getByText('ખાતરી કરો').waitFor();
    await page.locator('input').first().fill('123456');
    await shot('02-otp');
    await page.getByText('ખાતરી કરો').click();
    await page.getByText('Shivam Heights').first().waitFor({ timeout: 15000 });
  });
  await step('first sync finishes', async () => {
    await page.getByText('બધું મોકલાઈ ગયું').waitFor({ timeout: 20000 });
    await shot('03-home');
  });
  let total = 0;
  await step('attendance: prefilled from the last day, saved', async () => {
    await page.getByText('હાજરી', { exact: true }).last().click();
    await page.getByText(/^\d+ માણસ: /).last().waitFor(); // prefilled from the last day on a fresh day
    await page.getByRole('button', { name: 'કડિયા plus' }).first().click();
    await shot('04-attendance');
    const label = await page.getByText(/^\d+ માણસ: /).last().textContent();
    total = Number(label.match(/^(\d+) માણસ/)[1]);
    await page.getByText('સેવ કરો', { exact: true }).click();
    await page.getByText(`${total} માણસ`).first().waitFor();
    await page.getByText('બધું મોકલાઈ ગયું').waitFor({ timeout: 20000 });
  });
  await step('material in: cement 50 bags from Umiya', async () => {
    await page.getByText('માલ આવ્યો', { exact: true }).click();
    await page.getByRole('button', { name: 'Umiya Cement Traders', exact: true }).click();
    await page.getByRole('textbox', { name: 'ચલણ' }).fill('UC-9001');
    await page.getByText('સિમેન્ટ', { exact: true }).click();
    await page.getByRole('textbox', { name: 'જથ્થો' }).first().fill('50');
    await shot('05-grn');
    await page.getByText(/^સેવ કરો/).last().click();
    await page.getByText(/^\d+ એન્ટ્રી$/).first().waitFor();
  });
  await step('today’s work: column, floor, 60%', async () => {
    await page.getByText('આજનું કામ', { exact: true }).last().click();
    await page.getByText('કોલમ', { exact: true }).click();
    await page.getByRole('button', { name: 'Floor 7', exact: true }).click();
    await page.getByText('60%', { exact: true }).click();
    await shot('06-progress');
    await page.getByText('સેવ કરો', { exact: true }).last().click();
    await page.getByText('આજે ભરેલું').waitFor();
    await page.getByRole('button', { name: 'પાછા' }).click();
  });
  await step('stock shows cement after the receipt', async () => {
    await page.getByText('સ્ટોક', { exact: true }).click();
    await page.getByText('સિમેન્ટ', { exact: true }).filter({ visible: true }).first().waitFor();
    await shot('07-stock');
    await page.getByRole('button', { name: 'પાછા' }).click();
  });
  await step('everything reaches the office', async () => {
    await page.getByText('બધું મોકલાઈ ગયું').waitFor({ timeout: 20000 });
    const owner = await apiAs('+919800000001');
    const today = (await owner('/dashboard')).date;
    const site = (await owner('/dashboard')).sites[0];
    if (site.labour.workers !== total) throw new Error(`office sees ${site.labour.workers} workers, phone saved ${total}`);
    if (!site.materialIn.some((m) => m.challanNo === 'UC-9001' && m.qty === 50)) throw new Error('GRN missing at office');
    if (!site.progress.some((p) => p.percent === 60)) throw new Error('progress missing at office');
    console.log(`(office: ${today}, ${total} workers)`);
  });
  await step('offline: an advance waits on the phone, then reaches the office', async () => {
    await page.context().setOffline(true);
    await page.getByText('ઉપાડ', { exact: true }).click();
    const rupees = 1000 + (Date.now() % 900);
    await page.getByText('Jay Ambe Shuttering', { exact: true }).click();
    await page.locator('input').first().fill(String(rupees));
    await page.getByText('સેવ કરો', { exact: true }).click();
    await page.getByText(/ઓફલાઇન · 1|1 એન્ટ્રી મોકલવાની બાકી/).first().waitFor({ timeout: 10000 });
    await shot('09-offline');
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByText('બધું મોકલાઈ ગયું').first().waitFor({ timeout: 30000 }); // back online: sends on its own
    const owner = await apiAs('+919800000001');
    const site = (await owner('/projects'))[0];
    const adv = await owner(`/wages/advances?projectId=${site.id}`);
    if (!adv.some((a) => a.amountPaise === rupees * 100)) throw new Error('offline advance did not reach the office');
  });
  await step('sync screen', async () => {
    await page.getByText('બધું મોકલાઈ ગયું').click();
    await shot('08-sync');
  });
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('PASS');
} catch (e) {
  await shot('zz-failure').catch(() => {});
  console.error('\nFAIL', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
