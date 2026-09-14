import { chromium } from 'playwright-core';
import fs from 'node:fs';

const results = [];
const errors = [];
function ok(name, cond, extra = '') { results.push({ name, pass: !!cond }); console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#mainContent')?.innerHTML?.length > 500, null, { timeout: 30000 });
await page.waitForTimeout(1000);

// seed 2 revise cards
await page.evaluate(() => { const ch = DATA.chapters[0]; setQStatus(ch.id, ch.questions[0], 'revise'); setQStatus(ch.id, ch.questions[1], 'revise'); });
await page.evaluate(() => setView('due'));
await page.waitForTimeout(800);
let rows = await page.locator('#mainContent table tbody tr').count();
ok('due view lists 2 starred cards', rows === 2, `rows=${rows}`);
await page.screenshot({ path: './shots/qa-p2-due.png' });

// grade first Good
await page.locator('#mainContent table tbody tr').first().locator('button', { hasText: 'Good' }).click();
await page.waitForTimeout(800);
rows = await page.locator('#mainContent table tbody tr').count();
const srs = await page.evaluate(() => JSON.parse(localStorage.getItem('dsa-tracker-v3')).srs);
const k1 = Object.keys(srs)[0];
ok('Good reschedules out of due', rows === 1, `rows=${rows}`);
ok('srs record SM-2 shaped', srs[k1].interval === 1 && srs[k1].reps === 1 && srs[k1].ease === 2.5, JSON.stringify(srs[k1]));
const st1 = await page.evaluate((k) => JSON.parse(localStorage.getItem('dsa-tracker-v3')).questions[k], k1);
ok('Good marks done', st1 === 'done');
ok('due badge decremented', (await page.textContent('#dueCount')).trim() === '1');

// grade remaining Again
await page.locator('#mainContent table tbody tr').first().locator('button', { hasText: 'Again' }).click();
await page.waitForTimeout(800);
rows = await page.locator('#mainContent table tbody tr').count();
const k2 = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('dsa-tracker-v3')).srs).find(k => JSON.parse(localStorage.getItem('dsa-tracker-v3')).questions[k] === 'revise'));
ok('Again keeps card due + revise', rows === 1 && !!k2, `rows=${rows}`);

// simulate next day: push Good card overdue (in-memory + persist)
await page.evaluate(() => { const k = Object.keys(progress.srs).find(x => progress.questions[x] === 'done'); progress.srs[k].due = srsToday() - 86400000; save(); render(); });
await page.waitForTimeout(800);
rows = await page.locator('#mainContent table tbody tr').count();
const dueCell = await page.locator('#mainContent table tbody tr td').first().textContent();
ok('overdue card returns to due', rows === 2 && /overdue/.test(dueCell || ''), `rows=${rows} label=${(dueCell || '').trim()}`);

// Anki export download
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('#mainContent button', { hasText: 'Anki' }).first().click()
]);
const dlPath = await download.path();
const dlSize = dlPath && fs.existsSync(dlPath) ? fs.statSync(dlPath).size : 0;
ok('anki TSV downloads', (download.suggestedFilename() || '').endsWith('.tsv') && dlSize > 50, `${download.suggestedFilename()} ${dlSize}b`);

// difficulty strip
const strip = await page.locator('#diffStrip').innerText();
ok('difficulty strip renders E/M/H', /BY LEVEL/.test(strip || '') && /E[\s\S]*M[\s\S]*H/.test(strip || ''), (strip || '').replace(/\s+/g, ' ').slice(0, 80));

// target-company checklist
await page.evaluate(() => { selectedCompany = 'amazon'; selectedTimeframe = '30d'; view = 'companies'; updateViewBtns(); });
await page.waitForFunction(() => !!document.querySelector('#mainContent table tbody tr'), null, { timeout: 30000 });
await page.waitForTimeout(500);
await page.evaluate(() => setCompanyTarget());
await page.waitForTimeout(800);
const banner = await page.textContent('#mainContent');
ok('target banner shows', /Target:.*Amazon/.test((banner || '').replace(/\s+/g, ' ')));
await page.locator('#mainContent button', { hasText: 'Mark page done' }).click();
await page.waitForTimeout(1000);
const doneRows = await page.locator('#mainContent table tbody tr.q-done').count();
ok('mark page done ticks page', doneRows >= 40, `q-done=${doneRows}`);
await page.screenshot({ path: './shots/qa-p2-target.png' });

console.log('\n--- errors: ' + errors.length + ' ---');
errors.slice(0, 20).forEach(e => console.log('ERR: ' + e));
const failed = results.filter(r => !r.pass).length;
console.log(`RESULT: ${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
