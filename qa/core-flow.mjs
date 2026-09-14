import { chromium } from 'playwright-core';

const URL = 'http://localhost:3000/';
const SHOT = (n) => `./shots/${n}.png`;
const results = [];
const errors = [];
const logs = [];
function ok(name, cond, extra = '') { results.push({ name, pass: !!cond, extra }); console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
page.on('requestfailed', r => logs.push('reqfail: ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#mainContent')?.innerHTML?.length > 500, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: SHOT('qa-01-loaded') });

// --- Chapters: checkbox pick ---
const checks = page.locator('#mainContent table tbody .check');
const nChecks = await checks.count();
ok('chapter table has checkboxes', nChecks > 5, `n=${nChecks}`);
const done0 = await page.textContent('#doneCount');
await checks.first().click();
await page.waitForTimeout(800);
const firstCls = await checks.first().getAttribute('class');
const done1 = await page.textContent('#doneCount');
ok('click check ticks it', (firstCls || '').includes('done'), `class="${firstCls}" done ${done0}->${done1}`);
const ls1 = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('dsa-tracker-v3') || '{}').questions || {}).length);
ok('progress persisted to localStorage', ls1 >= 1, `keys=${ls1}`);

await checks.nth(1).click();
await page.waitForTimeout(800);
const done2 = await page.textContent('#doneCount');
ok('second check ticks independently', done2.trim() === '2', `done=${done2}`);
await page.screenshot({ path: SHOT('qa-02-checked') });

await checks.first().click(); // untick
await page.waitForTimeout(800);
const done3 = await page.textContent('#doneCount');
ok('click again unticks', done3.trim() === '1', `done=${done3}`);

// --- status select ---
const sel = page.locator('#mainContent table tbody tr select').first();
await sel.selectOption('revise');
await page.waitForTimeout(800);
const rowCls = await page.locator('#mainContent table tbody tr').first().getAttribute('class');
const revCount = await page.textContent('#reviseCount');
ok('status select -> revise highlights row', (rowCls || '').includes('q-revise'), `row="${rowCls}" revise=${revCount}`);

// --- switch chapter ---
await page.locator('button[onclick^="selectChapter"]').nth(1).click();
await page.waitForTimeout(800);
const h2 = await page.textContent('#mainContent h2');
ok('chapter switch renders ch 2', /Hashing/.test(h2 || ''), (h2 || '').slice(0, 60));

// --- Unique + Revise views ---
await page.click('#btnAll');
await page.waitForTimeout(800);
const allRows = await page.locator('#mainContent table tbody tr').count();
ok('unique view table renders', allRows > 100, `rows=${allRows}`);
await page.click('#btnRevise');
await page.waitForTimeout(800);
const revRows = await page.locator('#mainContent table tbody tr').count();
ok('revise view shows revised Q', revRows >= 1, `rows=${revRows}`);
await page.screenshot({ path: SHOT('qa-03-revise') });

// --- Companies view ---
await page.click('#btnCompanies');
await page.waitForFunction(() => document.querySelector('#companySelect') && !/Loading/.test(document.querySelector('#companySelect').textContent || ''), null, { timeout: 30000 });
await page.waitForFunction(() => !!document.querySelector('#mainContent table tbody tr'), null, { timeout: 30000 });
await page.waitForTimeout(500);
const coRows = await page.locator('#mainContent table tbody tr').count();
ok('company table renders', coRows > 5, `rows=${coRows}`);
await page.screenshot({ path: SHOT('qa-04-company') });
await page.selectOption('#companySelect', 'google');
await page.waitForTimeout(1500);
const tape = await page.textContent('#mainContent .tape');
ok('company picker switches to Google', /Google/i.test(tape || ''), (tape || '').slice(0, 80));
const coSel = page.locator('#mainContent table tbody tr select').first();
await coSel.selectOption('done');
await page.waitForTimeout(800);
const coRowCls = await page.locator('#mainContent table tbody tr').first().getAttribute('class');
ok('company Q status -> done highlights', (coRowCls || '').includes('q-done'), `row="${coRowCls}"`);

// --- Board ---
await page.click('#btnBoard');
await page.waitForTimeout(1000);
await page.screenshot({ path: SHOT('qa-05-board') });
const cards0 = await page.locator('.board-card').count();
await page.locator('#boardToolbar button', { hasText: '+ Ch 01' }).click().catch(() => {});
await page.waitForTimeout(500);
let cards1 = await page.locator('.board-card').count();
// toolbar may vary; fallback to sidebar button
if (cards1 <= cards0) { await page.evaluate(() => boardAddCard('chapter', 1)); await page.waitForTimeout(500); cards1 = await page.locator('.board-card').count(); }
ok('board card added', cards1 > cards0, `${cards0}->${cards1}`);
const card = page.locator('.board-card').last();
const header = card.locator('.card-header');
const box0 = await card.boundingBox();
await header.hover();
await page.mouse.move(box0.x + 100, box0.y + 15);
await page.mouse.down();
await page.mouse.move(box0.x + 250, box0.y + 120, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
const box1 = await card.boundingBox();
const moved = Math.abs((box1?.x || 0) - (box0?.x || 0)) + Math.abs((box1?.y || 0) - (box0?.y || 0));
ok('board card drags', moved > 40, `moved=${Math.round(moved)}px`);
await page.screenshot({ path: SHOT('qa-06-board-dragged') });

// --- search palette ---
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.fill('#cmdInput', 'two sum');
await page.waitForTimeout(400);
const cmdItems = await page.locator('#cmdList button').count();
ok('cmd palette finds Two Sum', cmdItems >= 1, `items=${cmdItems}`);

// --- knowledge search ---
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.fill('#cmdInput', 'recursion');
await page.waitForTimeout(500);
const kbBtns = await page.locator('#cmdList button').count();
const kbText = await page.locator('#cmdList').textContent();
ok('knowledge hits appear', kbBtns > 1 && /[▤📄📖✎]/.test(kbText || ''), `items=${kbBtns}`);
const topicHit = page.locator('#cmdList button', { hasText: '▤' }).first();
if (await topicHit.count()) {
  await topicHit.click();
  await page.waitForTimeout(800);
  const h2k = await page.textContent('#mainContent h2').catch(() => '');
  const activeTab = await page.locator('#mainContent .tab.active').textContent().catch(() => '');
  ok('topic hit jumps to Topics tab', !!h2k && /Topics/.test(activeTab || ''), `tab=${(activeTab || '').trim()}`);
} else {
  ok('topic hit jumps to Topics tab', false, 'no topic hit for recursion');
}
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.fill('#cmdInput', 'knapsack');
await page.waitForTimeout(500);
const refHit = page.locator('#cmdList button', { hasText: '📖' }).first();
if (await refHit.count()) {
  await refHit.click();
  await page.waitForTimeout(800);
  const refVisible = await page.locator('#mainContent div[id^="pdf-reference-"]').first().isVisible().catch(() => false);
  ok('reference hit opens Reference panel', refVisible);
} else {
  ok('reference hit opens Reference panel', false, 'no reference hit for knapsack');
}
await page.keyboard.press('Escape');

// --- LC paste modal ---
await page.evaluate(() => openLcPaste());
await page.waitForTimeout(300);
ok('LC paste modal opens', await page.locator('#lcModal').isVisible());
await page.fill('#lcPaste', '1, 121');
await page.locator('#lcModal button', { hasText: 'Sync pasted' }).click();
await page.waitForTimeout(800);
const donePaste = await page.textContent('#doneCount');
ok('LC paste syncs solved', Number(donePaste.trim()) >= 2, `done=${donePaste}`);

// --- palette keyboard nav + recent ---
await page.evaluate(() => setView('chapters'));
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.fill('#cmdInput', 'google');
await page.waitForTimeout(400);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const tapeKb = await page.textContent('#mainContent .tape');
ok('palette arrow+enter jumps to Google', /Google/i.test(tapeKb || ''), (tapeKb || '').slice(0, 60));
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.fill('#cmdInput', '');
await page.waitForTimeout(400);
const recentFirst = await page.locator('#cmdList button').first().textContent();
ok('palette shows recent jumps', /↻/.test(recentFirst || ''), (recentFirst || '').slice(0, 50));
await page.keyboard.press('Escape');

// --- milestone toast + heatmap ---
await page.evaluate(() => setView('chapters'));
await page.evaluate(() => markChapterDone(1));
await page.waitForTimeout(1000);
const toastLast = await page.locator('#toasts .toast').last().textContent().catch(() => '');
ok('chapter-complete milestone toast', /Chapter 01 complete/.test(toastLast || ''), (toastLast || '').slice(0, 60));
ok('heatmap renders 84 cells', await page.locator('#heatmap div div').count() === 84, `cells=${await page.locator('#heatmap div div').count()}`);

// back to chapters via API (sidebar hidden in board mode), final state
await page.keyboard.press('Escape');
await page.evaluate(() => setView('chapters'));
await page.waitForTimeout(800);
await page.screenshot({ path: SHOT('qa-07-final') });

console.log('\n--- console/page errors: ' + errors.length + ' ---');
errors.slice(0, 20).forEach(e => console.log('ERR: ' + e));
console.log('--- failed requests ---');
logs.slice(0, 20).forEach(l => console.log(l));
const failed = results.filter(r => !r.pass).length;
console.log(`\nRESULT: ${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
