import { chromium } from 'playwright-core';

const results = [];
const errors = [];
function ok(name, cond, extra = '') { results.push({ name, pass: !!cond }); console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#mainContent')?.innerHTML?.length > 500, null, { timeout: 30000 });
await page.waitForTimeout(1000);

// setup screen
await page.evaluate(() => setView('sprint'));
await page.waitForTimeout(500);
ok('sprint setup renders', await page.locator('#spSource').isVisible() && await page.locator('#spChapter').isVisible());

// start chapter sprint: 5 Qs, 5 min
await page.selectOption('#spSource', 'chapter');
await page.selectOption('#spChapter', '1');
await page.selectOption('#spCount', '5');
await page.locator('#mainContent button', { hasText: 'Start sprint' }).click();
await page.waitForTimeout(800);
const clock = await page.textContent('#sprintClock').catch(() => '');
ok('session starts with clock', /^\d+:\d\d$/.test((clock || '').trim()), `clock=${(clock || '').trim()}`);
const q1 = await page.locator('#mainContent h3').textContent().catch(() => '');
ok('first question shown', (q1 || '').length > 3, (q1 || '').slice(0, 40));
await page.screenshot({ path: './shots/qa-p4-sprint.png' });

// answer: solved, solved, skipped via buttons
await page.locator('#mainContent button', { hasText: 'Solved' }).click();
await page.waitForTimeout(400);
await page.locator('#mainContent button', { hasText: 'Solved' }).click();
await page.waitForTimeout(400);
await page.locator('#mainContent button', { hasText: 'Skip' }).click();
await page.waitForTimeout(400);
const prog = await page.textContent('#mainContent .tape').catch(() => '');
ok('progress advances 4/5', /4\/5/.test(prog || ''), (prog || '').trim());
// keyboard Y then N finishes
await page.keyboard.press('y');
await page.waitForTimeout(400);
await page.keyboard.press('n');
await page.waitForTimeout(800);
const resTape = await page.textContent('#mainContent .tape').catch(() => '');
ok('results screen shows', /results/i.test(resTape || ''), (resTape || '').trim());
const pct = await page.locator('#mainContent .serif.text-5xl').textContent().catch(() => '');
ok('score 60% (3 solved, 2 skipped)', (pct || '').trim() === '60%', `pct=${(pct || '').trim()}`);
const inked = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('dsa-tracker-v3')).questions).filter(v => v === 'done').length);
ok('solved auto-inked as done', inked >= 3, `done=${inked}`);

// timeout path
await page.locator('#mainContent button', { hasText: 'New sprint' }).click();
await page.waitForTimeout(500);
await page.selectOption('#spSource', 'chapter');
await page.selectOption('#spChapter', '2');
await page.selectOption('#spCount', '5');
await page.locator('#mainContent button', { hasText: 'Start sprint' }).click();
await page.waitForTimeout(600);
await page.evaluate(() => { sprint.endsAt = Date.now() + 1200; });
await page.waitForTimeout(3000);
const toTape = await page.textContent('#mainContent .tape').catch(() => '');
ok('timeout finishes with time-up', /time up/i.test(toTape || ''), (toTape || '').trim());

// company source
await page.locator('#mainContent button', { hasText: 'New sprint' }).click();
await page.waitForTimeout(500);
await page.selectOption('#spSource', 'company');
await page.waitForTimeout(300);
await page.selectOption('#spCount', '5');
await page.locator('#mainContent button', { hasText: 'Start sprint' }).click();
await page.waitForTimeout(2500);
const coSub = await page.textContent('#mainContent').catch(() => '');
ok('company sprint starts', /30d/.test(coSub || ''));

console.log('\n--- errors: ' + errors.length + ' ---');
errors.slice(0, 20).forEach(e => console.log('ERR: ' + e));
const failed = results.filter(r => !r.pass).length;
console.log(`RESULT: ${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
