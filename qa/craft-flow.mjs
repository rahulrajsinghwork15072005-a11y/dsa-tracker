import { chromium } from 'playwright-core';
import fs from 'node:fs';

const results = [];
const errors = [];
const resErr = [];
function ok(name, cond, extra = '') { results.push({ name, pass: !!cond }); console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') resErr.push('resource: ' + m.text().slice(0, 120)); });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#mainContent')?.innerHTML?.length > 500, null, { timeout: 30000 });
await page.waitForTimeout(1200);

// --- board curves + minimap ---
await page.evaluate(() => setView('board'));
await page.waitForTimeout(600);
await page.evaluate(() => { boardAddCard('chapter', 1); boardAddCard('company', 'google'); });
await page.waitForTimeout(600);
const paths = await page.locator('#boardConnections path').count();
ok('bezier links render as paths', paths >= 2, `paths=${paths}`);
const dots = await page.locator('#boardMiniCards div').count();
ok('minimap shows cards', dots >= 2, `dots=${dots}`);
await page.screenshot({ path: './shots/qa-p3-board.png' });

// delete a link by clicking it
const links0 = await page.evaluate(() => boardConnections.length);
await page.locator('#boardConnections path[data-conn]').first().click({ force: true });
await page.waitForTimeout(500);
const links1 = await page.evaluate(() => boardConnections.length);
ok('click link deletes it', links1 === links0 - 1, `${links0}->${links1}`);

// export layout
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('#boardToolbar button', { hasText: '' }).first().click().catch(() => {})
]).catch(() => [null]);
// toolbar export has icon only; click via evaluate to be precise
let dlInfo = 'none';
if (!dl) {
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => boardExport())
  ]);
  const p2 = await dl2.path();
  const j = JSON.parse(fs.readFileSync(p2, 'utf-8'));
  dlInfo = `${dl2.suggestedFilename()} cards=${(j.cards || []).length} links=${(j.links || []).length}`;
  ok('board export downloads layout JSON', Array.isArray(j.cards) && Array.isArray(j.links), dlInfo);
  // import it back after clearing
  await page.evaluate(() => boardClearNoConfirm());
  await page.waitForTimeout(300);
  const c0 = await page.locator('.board-card').count();
  await page.locator('#boardToolbar input[type="file"]').setInputFiles(p2);
  await page.waitForTimeout(800);
  const c1 = await page.locator('.board-card').count();
  ok('board import restores cards', c0 === 0 && c1 >= 2, `${c0}->${c1}`);
} else { ok('board export downloads layout JSON', false, 'unexpected path'); }

// --- dark mode ---
await page.evaluate(() => setView('chapters'));
await page.waitForTimeout(500);
await page.click('#themeBtn');
await page.waitForTimeout(500);
const darkOn = await page.evaluate(() => document.body.classList.contains('dark') && localStorage.getItem('dsa-theme') === 'dark');
ok('dark mode toggles + persists', darkOn);
await page.screenshot({ path: './shots/qa-p3-dark.png' });
const whiteBlowout = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#mainContent .paper, #mainContent table')];
  return els.filter(el => { const bg = getComputedStyle(el).backgroundColor; return bg === 'rgb(255, 255, 255)'; }).length;
});
ok('no white blowouts in dark', whiteBlowout === 0, `white=${whiteBlowout}`);
await page.click('#themeBtn');
await page.waitForTimeout(300);

// --- PWA / offline ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const swReg = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
ok('service worker registered', swReg);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => (document.querySelector('#mainContent')?.innerHTML?.length || 0) > 500, null, { timeout: 30000 });
const offLen = await page.evaluate(() => document.querySelector('#mainContent').innerHTML.length);
ok('offline reload renders from cache', offLen > 500, `bytes=${offLen}`);
const twOff = await page.evaluate(() => typeof tailwind !== 'undefined');
ok('tailwind served offline from cache', twOff);
await page.screenshot({ path: './shots/qa-p3-offline.png' });
await ctx.setOffline(false);

console.log('\n--- errors: ' + errors.length + ' ---');
errors.slice(0, 20).forEach(e => console.log('ERR: ' + e));
const failed = results.filter(r => !r.pass).length;
console.log(`RESULT: ${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
