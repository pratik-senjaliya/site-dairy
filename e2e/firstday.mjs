// A new builder's first day, against the real API and only through the phone app:
// sign up → add a site with floors → add a supervisor and a contractor with a rate → enter attendance himself
// → ask for material, approve it, order it from a new supplier → the supervisor signs in and sees the site.
// Needs: API (SIGNUP_OPEN not false, OTP_DEV_CODE=123456) and the phone web build pointed at it.
//   APP_URL=http://localhost:8081 node e2e/firstday.mjs [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const out = process.argv[2] ?? 'e2e/.out';
fs.mkdirSync(out, { recursive: true });
const rnd = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const ownerPhone = rnd();
const supPhone = rnd();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const newPhone = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/wa\.me/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  return page;
};
let page = await newPhone();
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};
const shot = (name) => page.screenshot({ path: `${out}/first-${name}.png` });
const text = (s) => page.getByText(s, { exact: true }).filter({ visible: true }).first();
const field = (label) => page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
const tap = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();

async function signIn(phone) {
  await page.goto(APP);
  await text('OTP મોકલો').waitFor({ timeout: 60000 });
  await field('મોબાઇલ નંબર').fill(phone);
  await text('OTP મોકલો').click();
  await text('ખાતરી કરો').waitFor({ timeout: 20000 });
  await field('OTP નાખો').fill('123456');
  await text('ખાતરી કરો').click();
}

try {
  await step('a new number signs up a company', async () => {
    await signIn(ownerPhone);
    await text('તમારી કંપની શરૂ કરો').waitFor({ timeout: 20000 });
    await field('કંપનીનું નામ').fill('First Day Builders');
    await field('તમારું નામ').fill('Mahesh Patel');
    await text('શરૂ કરો').click();
    await text('ચાલો શરૂ કરીએ').waitFor({ timeout: 30000 });
    await shot('01-welcome');
  });
  await step('step 1: a site with 2 floors', async () => {
    await text('પહેલી સાઇટ ઉમેરો').click();
    await field('સાઇટનું નામ શું છે?').fill('Krishna Residency');
    await field('કેટલા માળ છે?').fill('2');
    await tap('સાઇટ બનાવો');
    await text('3 માળ').waitFor({ timeout: 20000 }); // ground + 2
    await shot('02-site');
  });
  await step('step 3 from the site: its supervisor', async () => {
    await tap('સુપરવાઇઝર ઉમેરો');
    await field('નામ શું છે?').fill('Suresh Supervisor');
    await field('મોબાઇલ નંબર').fill(supPhone);
    await tap('સેવ કરો');
    await text('WhatsApp પર જાણ કરો').waitFor({ timeout: 20000 });
    await tap('થઈ ગયું');
    await text('Suresh Supervisor').waitFor({ timeout: 20000 });
  });
  await step('step 2: a contractor with a mason rate', async () => {
    await page.goto(`${APP}/setup/contractors`);
    await tap('કોન્ટ્રાક્ટર ઉમેરો');
    await field('કોન્ટ્રાક્ટરનું નામ').fill('Ramdev Construction');
    await field('કડિયા ₹').fill('900');
    await tap('સેવ કરો');
    await page.getByText(/કડિયા ₹900/).filter({ visible: true }).first().waitFor({ timeout: 20000 });
  });
  await step('home: checklist done, the site card offers entries', async () => {
    await page.goto(APP);
    await text('Krishna Residency').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    if (await text('ચાલો શરૂ કરીએ').isVisible()) throw new Error('getting-started still shown after all three steps');
    await shot('03-home');
  });
  await step('the builder enters attendance himself', async () => {
    await text('એન્ટ્રી કરો').click();
    await text('હાજરી').click();
    await text('Ramdev Construction').click();
    await text('કડિયા').click();
    await page.getByLabel('કડિયા plus').filter({ visible: true }).first().click();
    await page.getByLabel('કડિયા plus').filter({ visible: true }).first().click();
    await page.getByText(/^2 માણસ: Ramdev Construction 2/).filter({ visible: true }).first().waitFor();
    await tap('સેવ કરો');
    await page.getByText(/^2 માણસ: Ramdev Construction 2/).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await shot('04-entries');
  });
  await step('asks for cement, approves it, orders from a new supplier', async () => {
    await text('માલની માંગણી').click();
    await text('સિમેન્ટ').click();
    await page.getByRole('button', { name: '+100' }).filter({ visible: true }).first().click();
    await tap('મંજૂરી માટે મોકલો');
    await page.getByLabel('બધું મોકલાઈ ગયું', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 30000 });
    await page.goto(`${APP}/approvals`);
    await text('મંજૂર').click({ timeout: 30000 });
    await text('કોને ઓર્ડર આપવો?').waitFor({ timeout: 30000 });
    await text('નવો સપ્લાયર').click();
    await field('નવો સપ્લાયર').fill('Jalaram Cement');
    await tap('ઉમેરો');
    await page.getByText(/^ઓર્ડર: Jalaram Cement — સિમેન્ટ 100 bag/).filter({ visible: true }).waitFor({ timeout: 30000 });
    await shot('05-order');
    await tap('ઓર્ડર કરો અને WhatsApp પર મોકલો');
    await text('કોને ઓર્ડર આપવો?').waitFor({ state: 'hidden', timeout: 30000 });
  });
  await step('the supervisor signs in and lands on the site with today’s attendance', async () => {
    page = await newPhone();
    await signIn(supPhone);
    await text('Krishna Residency').waitFor({ timeout: 30000 });
    await page.getByText(/^2 માણસ: Ramdev Construction 2/).filter({ visible: true }).first().waitFor({ timeout: 30000 });
    await shot('06-supervisor');
  });
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('PASS');
} catch (e) {
  await shot('zz-failure').catch(() => {});
  console.log(`\nFAIL ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
