// The launch features in the demo build (no API): measured work billed in the hisab, the flats' payment plan,
// and parties' last rates.
//   node e2e/launch.mjs [appUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const APP = process.argv[2] ?? 'http://localhost:8090';
const OUT = process.argv[3] ?? 'e2e/.out';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
await ctx.route(/wa\.me/, (r) => r.abort());
await ctx.route(/:4000\//, (r) => r.abort());
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => void d.accept());
const step = async (n, fn) => { process.stdout.write(`• ${n} … `); await fn(); console.log('ok'); };
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const vis = (x) => x.filter({ visible: true }).first();
const as = async (role) => {
  await vis(page.getByText('પ્રોફાઇલ', { exact: true })).click();
  await page.getByText('બીજી વ્યક્તિ તરીકે જુઓ').click();
  await page.getByRole('button', { name: role, exact: true }).click();
  await vis(page.getByText('Shivam Heights')).waitFor({ timeout: 15000 });
};
const back = () => vis(page.getByLabel(/^(પાછા|Back)$/)).click();
try {
  await step('supervisor: measures 1,200 sq ft of slab centering on Floor 7', async () => {
    await page.goto(APP);
    await page.getByRole('button', { name: 'સુપરવાઇઝર', exact: true }).click();
    await vis(page.getByText('Shivam Heights')).waitFor({ timeout: 15000 });
    await vis(page.getByText('માપ', { exact: true })).click();
    await vis(page.getByText(/સેન્ટરિંગ · Jay Ambe/)).click();
    await vis(page.getByText('સ્લેબ સેન્ટરિંગ', { exact: true })).click();
    await vis(page.getByText('Floor 7', { exact: true })).click();
    await vis(page.getByText('લંબાઈ × પહોળાઈ થી ગણો')).click();
    await vis(page.getByRole('textbox', { name: 'લંબાઈ' })).fill('40');
    await vis(page.getByRole('textbox', { name: 'પહોળાઈ' })).fill('30');
    await vis(page.getByText('= 1,200 sq ft')).waitFor();
    await vis(page.getByText(/સ્લેબ સેન્ટરિંગ 1,200 sq ft — Floor 7$/)).waitFor();
    if (await page.getByText(/₹26,400/).filter({ visible: true }).count()) throw new Error('the supervisor sees the amount');
    await shot('launch-01-measure');
    await vis(page.getByRole('button', { name: 'સેવ કરો', exact: true })).click();
    await vis(page.getByText('માપ', { exact: true })).waitFor();
  });
  await step('owner: the hisab bills the three slabs less the upad, and settles it', async () => {
    await as('માલિક');
    await vis(page.getByText('કોન્ટ્રાક્ટર હિસાબ', { exact: true })).click();
    // 2,450 + 2,380.5 + 1,200 = 6,030.5 sq ft × ₹22 = ₹1,32,671 − ₹3,000 upad
    await vis(page.getByText('Jay Ambe Shuttering')).waitFor({ timeout: 15000 });
    await vis(page.getByText('₹1,29,671')).waitFor();
    await vis(page.getByText(/^માપ પ્રમાણે/)).click();
    await vis(page.getByText('સ્લેબ સેન્ટરિંગ · 6,030.5 sq ft')).waitFor();
    await shot('launch-02-hisab');
    await vis(page.getByRole('button', { name: /નો હિસાબ કરો$/ })).click();
    await vis(page.getByRole('button', { name: 'હા, હિસાબ કરો' })).click();
    await vis(page.getByText(/ચૂકવવાના$/)).waitFor({ timeout: 15000 });
    await shot('launch-03-settled');
  });
  await step('owner: measurement list shows them billed', async () => {
    await vis(page.getByRole('button', { name: 'માપ લખો' })).click();
    await vis(page.getByText('✓ હિસાબમાં')).waitFor({ timeout: 15000 });
    await shot('launch-04-measures-billed');
    await back();
  });
  await step('owner: payment plan, slab 6 done, flats owe more', async () => {
    await back();
    await vis(page.getByText('પૈસાનો હિસાબ', { exact: true })).click();
    await vis(page.getByText(/^ફ્લેટ/)).click();
    await vis(page.getByText(/ફ્લેટના હમણાં લેવાના/)).waitFor({ timeout: 15000 });
    const before = await vis(page.getByText(/ફ્લેટના હમણાં લેવાના/)).textContent();
    await shot('launch-05-flats');
    await vis(page.getByRole('button', { name: 'હપ્તા પ્લાન' })).click();
    await vis(page.getByText('સ્લેબ 6 · 4.16%')).waitFor({ timeout: 15000 });
    await shot('launch-06-plan');
    await vis(page.getByRole('button', { name: 'પૂરું થયું' })).click();
    await vis(page.getByText('સ્લેબ 6 પૂરું થયું?')).waitFor();
    await page.getByRole('button', { name: 'પૂરું થયું' }).filter({ visible: true }).last().click();
    for (let i = 0; (await page.getByText(/^✓ પૂરું/).count()) < 8; i++) {
      if (i > 50) throw new Error('slab 6 not marked done');
      await page.waitForTimeout(200);
    }
    await back();
    await vis(page.getByText(/ફ્લેટના હમણાં લેવાના/)).waitFor();
    const after = await vis(page.getByText(/ફ્લેટના હમણાં લેવાના/)).textContent();
    if (after === before) throw new Error(`due now did not change: ${after}`);
    await vis(page.getByText('A-101', { exact: true })).click();
    await vis(page.getByText('હપ્તા', { exact: true })).waitFor({ timeout: 15000 });
    await vis(page.getByRole('button', { name: 'હપ્તાની યાદ WhatsApp પર' })).waitFor();
    await shot('launch-07-flat');
  });
  await step('owner: steel from two parties, the lowest last rate marked', async () => {
    await page.goto(APP);
    await vis(page.getByText('સપ્લાયર હિસાબ', { exact: true })).click();
    await vis(page.getByText('માલ પ્રમાણે')).click();
    await vis(page.getByText(/છેલ્લો ભાવ ₹61\/kg .*સૌથી ઓછો/)).waitFor({ timeout: 15000 });
    await shot('launch-08-rates');
  });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('launch features OK');
} catch (e) {
  await shot('launch-failed').catch(() => undefined);
  console.error(e);
  process.exitCode = 1;
} finally {
  await b.close();
}
