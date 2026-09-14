import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// isolated datastore (server reads DATA_DIR at import) + quiet logs
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-test-'));
process.env.LOG_LEVEL = 'warn';
const { app } = await import('../server.js');

let server, base;
before(async () => {
  await new Promise((res) => { server = app.listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((res) => server.close(res)));

async function api(method, p, body, token) {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}

test('health + ready', async () => {
  const h = await api('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.json.status, 'ok');
  const r = await api('GET', '/api/readyz');
  assert.equal(r.json.status, 'ready');
});

test('companies list', async () => {
  const c = await api('GET', '/api/companies');
  assert.equal(c.status, 200);
  assert.equal(c.json.totalCompanies, 470);
  assert.ok(c.json.companies[0].slug);
  assert.ok(c.json.companies[0].counts.all >= 0);
});

test('company questions + filters', async () => {
  const a = await api('GET', '/api/company/amazon?timeframe=30d&sort=frequency&page=1&limit=5');
  assert.equal(a.status, 200);
  assert.equal(a.json.company, 'Amazon');
  assert.equal(a.json.questions.length, 5);
  const q0 = a.json.questions[0];
  assert.ok(q0.lcId && q0.title && q0.slug && typeof q0.frequency === 'number');

  const e = await api('GET', '/api/company/amazon?timeframe=30d&difficulty=Easy&limit=50');
  assert.ok(e.json.questions.length > 0);
  assert.ok(e.json.questions.every((q) => q.difficulty === 'Easy'));

  const s = await api('GET', '/api/company/amazon?q=two-sum&limit=10');
  assert.ok(s.json.questions.some((q) => q.slug === 'two-sum'));

  const t = await api('GET', '/api/company/amazon?sort=title&limit=50');
  const titles = t.json.questions.map((q) => q.title);
  assert.deepEqual(titles, [...titles].sort((x, y) => x.localeCompare(y)));

  const far = await api('GET', '/api/company/amazon?page=9999&limit=50');
  assert.equal(far.json.questions.length, 0);

  const missing = await api('GET', '/api/company/nosuchco');
  assert.equal(missing.status, 404);
});

test('question companies', async () => {
  const q = await api('GET', '/api/question/1/companies');
  assert.equal(q.status, 200);
  assert.ok(q.json.total > 0);
  assert.ok(q.json.companies[0].slug);
});

test('auth + progress roundtrip', async () => {
  const email = `qa${Date.now()}@test.local`;
  const reg = await api('POST', '/api/register', { email, password: 'Test1234!', name: 'QA' });
  assert.equal(reg.status, 200);
  assert.ok(reg.json.token);

  const dup = await api('POST', '/api/register', { email, password: 'Test1234!' });
  assert.equal(dup.status, 400);

  const weak = await api('POST', '/api/register', { email: `w${Date.now()}@t.local`, password: 'short' });
  assert.equal(weak.status, 400);

  const badLogin = await api('POST', '/api/login', { email, password: 'Wrong9999' });
  assert.equal(badLogin.status, 401);

  const login = await api('POST', '/api/login', { email, password: 'Test1234!' });
  assert.equal(login.status, 200);
  const tok = login.json.token;

  const noAuth = await api('GET', '/api/progress');
  assert.equal(noAuth.status, 401);

  const g0 = await api('GET', '/api/progress', null, tok);
  assert.ok(g0.json.questions && g0.json.topics);

  const w = await api('POST', '/api/progress', {
    questions: { LC1: 'done' },
    _time: { LC1: 1 },
    lcUser: 'someone',
    companyPrefs: { target: 'amazon', timeframe: '30d' },
  }, tok);
  assert.equal(w.json.questions.LC1, 'done');
  assert.equal(w.json.companyPrefs.target, 'amazon');

  const g1 = await api('GET', '/api/progress', null, tok);
  assert.equal(g1.json.questions.LC1, 'done');

  const co = await api('GET', '/api/company/amazon?timeframe=30d&limit=50', null, tok);
  const twoSum = co.json.questions.find((q) => q.lcId === 1);
  assert.ok(twoSum);
  assert.equal(twoSum.status, 'done');
});

test('spa fallback + unknown api', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('DSA Mastery') || html.includes('DSA Tracker'));
  const n = await api('GET', '/api/nope');
  assert.equal(n.status, 404);
});

test('lc proxy shape (tolerant of upstream)', async () => {
  const r = await api('GET', '/api/lc/octocat');
  assert.ok([200, 502].includes(r.status));
  assert.ok(r.json && (r.json.data !== undefined || r.json.error !== undefined));
});
