// A builder sets everything up from the phone (demo build, no server): a site with floors, a supervisor,
// a contractor with rates and a supplier — then makes an entry on the new site himself.
//   node e2e/setup.mjs [appUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const APP = process.argv[2] ?? 'http://localhost:8090';
const OUT = process.argv[3] ?? 'e2e/.out';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
await ctx.route(/:4000\//, (r) => r.abort());
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => void d.accept());
const step = async (n, fn) => { process.stdout.write(`• ${n} … `); await fn(); console.log('ok'); };
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const tap = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
const field = (label) => page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
const text = (s) => page.getByText(s, { exact: true }).filter({ visible: true }).first();
try {
  await step('owner opens setup', async () => {
    await page.goto(APP);
    await page.getByRole('button', { name: 'માલિક', exact: true }).click({ timeout: 60000 });
    await text('સેટઅપ').click({ timeout: 20000 });
    await text('નવી સાઇટ ઉમેરો').waitFor();
    await shot('setup-01-hub');
  });
  await step('new site with 3 floors in one save', async () => {
    await text('નવી સાઇટ ઉમેરો').click();
    await field('સાઇટનું નામ શું છે?').fill('Test Tower');
    await field('કેટલા માળ છે?').fill('3');
    await page.getByText('Test Tower — RCC બિલ્ડિંગ, 3 માળ').waitFor();
    await tap('સાઇટ બનાવો');
    await text('વિંગ અને માળ').waitFor({ timeout: 15000 });
    await text('4 માળ').waitFor(); // ground + 3
    await shot('setup-02-site');
  });
  await step('supervisor added to the site, invite offered', async () => {
    await text('+ ઉમેરો').click();
    await field('નામ શું છે?').fill('Ramesh Test');
    await field('મોબાઇલ નંબર').fill('9811111111');
    await page.getByText('Ramesh Test — સુપરવાઇઝર, Test Tower').waitFor();
    await tap('સેવ કરો');
    await text('WhatsApp પર જાણ કરો').waitFor();
    await shot('setup-03-invited');
    await tap('થઈ ગયું');
    await text('Ramesh Test').waitFor();
  });
  await step('contractor with a daily rate', async () => {
    await page.goBack();
    await text('કોન્ટ્રાક્ટર અને ભાવ').click();
    await tap('કોન્ટ્રાક્ટર ઉમેરો');
    await field('કોન્ટ્રાક્ટરનું નામ').fill('Test Contractor');
    await field('કડિયા ₹').fill('900');
    await tap('સેવ કરો');
    await page.getByText(/Test Contractor/).filter({ visible: true }).first().waitFor();
    await page.getByText(/કડિયા ₹900/).filter({ visible: true }).first().waitFor({ timeout: 10000 });
    await shot('setup-04-contractors');
  });
  await step('supplier', async () => {
    await page.goBack();
    await text('સપ્લાયર').click();
    await field('સપ્લાયરનું નામ').fill('Test Supplier');
    await tap('સપ્લાયર ઉમેરો');
    await text('Test Supplier').waitFor();
  });
  await step('the new site is on the home; the owner makes its attendance himself', async () => {
    await page.goto(APP);
    await text('Test Tower').waitFor({ timeout: 20000 });
    await shot('setup-05-home');
    const card = text('Test Tower').locator('xpath=ancestor::*[.//*[text()="એન્ટ્રી કરો"]][1]');
    await card.getByText('એન્ટ્રી કરો').click();
    await text('Test Tower').waitFor();
    await text('હાજરી').click();
    await page.getByText('Test Contractor').filter({ visible: true }).first().waitFor({ timeout: 10000 });
    await shot('setup-06-attendance');
  });
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('PASS');
} catch (e) {
  await shot('setup-fail');
  console.log(`\nFAIL ${e.message}`);
  process.exitCode = 1;
} finally {
  await b.close();
}
