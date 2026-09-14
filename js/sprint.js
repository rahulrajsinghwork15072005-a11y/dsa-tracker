// ---- Timed Sprint mode (countdown practice sessions) ----
let sprint = { phase: 'idle' };
let sprintTimer = null;

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function poolFromChapter(id){
  const ch = DATA.chapters.find((c) => c.id === Number(id));
  if (!ch) return [];
  const sub = 'Ch ' + String(ch.id).padStart(2, '0') + ' • ' + ch.title;
  return ch.questions.map((q) => ({
    key: qKey(q, ch.id), title: q.title, sub, url: lcUrl(q),
    difficulty: q.difficulty || '', chId: ch.id,
    lcOrId: (q.leetcode != null ? q.leetcode : q.id),
  }));
}
function poolFromRevise(){
  const out = [], seen = new Set();
  DATA.chapters.forEach((ch) => ch.questions.forEach((q) => {
    const key = qKey(q, ch.id);
    if (seen.has(key) || getQStatus(ch.id, q) !== 'revise') return;
    seen.add(key);
    out.push({ key, title: q.title, sub: 'Ch ' + String(ch.id).padStart(2, '0') + ' • ' + ch.title,
      url: lcUrl(q), difficulty: q.difficulty || '', chId: ch.id,
      lcOrId: (q.leetcode != null ? q.leetcode : q.id) });
  }));
  return out;
}
function poolFromDue(){
  return dueItems().map((it) => ({ key: it.key, title: it.title || it.key, sub: it.sub || '',
    url: it.url || '#', difficulty: it.difficulty || '', chId: it.chId != null ? it.chId : null,
    lcOrId: it.lcOrId != null ? it.lcOrId : null }));
}
async function poolFromCompany(slug, n){
  try {
    const r = await fetch('/api/company/' + encodeURIComponent(slug) + '?timeframe=30d&sort=frequency&limit=' + Math.max(n, 10));
    if (!r.ok) throw new Error('company fetch ' + r.status);
    const j = await r.json();
    const name = j.company || slug;
    return (j.questions || []).slice(0, n).map((q) => ({
      key: q.lcId ? 'LC' + q.lcId : 'SLUG:' + q.slug,
      title: q.title, sub: name + ' • 30d', url: 'https://leetcode.com/problems/' + q.slug + '/',
      difficulty: q.difficulty || '', chId: null, lcOrId: null,
    }));
  } catch (e) { toast('Company load failed: ' + e.message, true); return []; }
}
function persistSprint(){
  try {
    const { phase, queue, idx, results, totalSecs, endsAt, srcLabel } = sprint;
    progress.sprint = { phase, queue, idx, results, totalSecs, endsAt, srcLabel };
  } catch {}
  persistProgress();
}
async function startSprint(){
  const src = document.getElementById('spSource').value;
  const count = Number(document.getElementById('spCount').value || 10);
  const mins = Number(document.getElementById('spTime').value || 10);
  let pool = [], label = '';
  if (src === 'chapter'){
    const id = Number(document.getElementById('spChapter').value || 1);
    pool = poolFromChapter(id);
    const ch = DATA.chapters.find((c) => c.id === id);
    label = 'Ch ' + String(id).padStart(2, '0') + ' • ' + (ch ? ch.title : '');
  } else if (src === 'due'){ pool = poolFromDue(); label = 'Due queue'; }
  else if (src === 'revise'){ pool = poolFromRevise(); label = 'Revise queue'; }
  else if (src === 'company'){
    const slug = document.getElementById('spCompany').value || 'amazon';
    pool = await poolFromCompany(slug, count);
    label = slug + ' • 30d top';
  }
  shuffle(pool);
  pool = pool.slice(0, Math.max(1, Math.min(count, pool.length)));
  if (!pool.length){ toast('No questions in this source', true); return; }
  sprint = { phase: 'session', queue: pool, idx: 0, results: [],
    totalSecs: mins * 60, endsAt: Date.now() + mins * 60 * 1000,
    srcLabel: label, qStart: Date.now() };
  persistSprint(); render(); startSprintTick();
  toast('Sprint started — good luck ✒️');
}
function startSprintTick(){
  if (sprintTimer) clearInterval(sprintTimer);
  sprintTimer = setInterval(() => {
    if (!sprint || sprint.phase !== 'session'){ clearInterval(sprintTimer); sprintTimer = null; return; }
    const remain = Math.max(0, Math.round((sprint.endsAt - Date.now()) / 1000));
    const el = document.getElementById('sprintClock');
    if (el){
      el.textContent = Math.floor(remain / 60) + ':' + String(remain % 60).padStart(2, '0');
      el.classList.toggle('text-red-600', remain < 60);
    }
    const bar = document.getElementById('sprintTimeBar');
    if (bar && sprint.totalSecs) bar.style.width = Math.round((remain / sprint.totalSecs) * 100) + '%';
    if (remain <= 0) finishSprint(true);
  }, 1000);
}
function answerSprint(outcome){
  if (!sprint || sprint.phase !== 'session') return;
  const q = sprint.queue[sprint.idx];
  if (!q) return;
  sprint.results.push({ key: q.key, title: q.title, sub: q.sub, url: q.url,
    outcome, secs: Math.round((Date.now() - (sprint.qStart || Date.now())) / 1000) });
  sprint.idx++;
  sprint.qStart = Date.now();
  if (sprint.idx >= sprint.queue.length) finishSprint(false);
  else { persistSprint(); render(); }
}
function finishSprint(timeUp){
  if (!sprint || sprint.phase !== 'session') return;
  if (sprintTimer){ clearInterval(sprintTimer); sprintTimer = null; }
  let solved = 0;
  sprint.results.forEach((r) => {
    if (r.outcome === 'solved'){
      solved++;
      progress.questions[r.key] = 'done';
      progress._time[r.key] = Date.now();
    }
  });
  sprint.phase = 'done';
  sprint.timeUp = !!timeUp;
  persistSprint();
  renderStats(); renderSidebar(); render();
  const pct = sprint.results.length ? Math.round((solved / sprint.results.length) * 100) : 0;
  toast(timeUp ? 'Time! ' + solved + '/' + sprint.results.length + ' solved' : 'Sprint done: ' + pct + '%');
}
function quitSprint(){
  if (sprintTimer){ clearInterval(sprintTimer); sprintTimer = null; }
  sprint = { phase: 'idle' };
  try { delete progress.sprint; } catch {}
  persistProgress(); render();
}
function onSprintSource(){
  const v = document.getElementById('spSource').value;
  const ch = document.getElementById('spChapterWrap');
  const co = document.getElementById('spCompanyWrap');
  if (ch) ch.classList.toggle('hidden', v !== 'chapter');
  if (co) co.classList.toggle('hidden', v !== 'company');
}
function fmtClock(total){
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
function renderSprint(){
  const main = document.getElementById('mainContent');
  if (sprint.phase === 'session' && (!sprint.queue || !sprint.queue.length)) sprint.phase = 'idle';
  if (sprint.phase === 'idle'){
    const chOpts = DATA.chapters.map((c) => `<option value="${c.id}">Ch ${String(c.id).padStart(2, '0')} • ${esc(c.title)}</option>`).join('');
    let coOpts = '<option value="amazon">Amazon</option>';
    if (companiesMeta && companiesMeta.companies) coOpts = companiesMeta.companies.slice(0, 30).map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
    main.innerHTML = `
      <div class="paper rounded-2xl overflow-hidden">
        <div class="tape">Sprint ⏱ — timed practice</div>
        <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="ml-0 lg:ml-10 mt-8 p-4 max-w-[560px] space-y-3">
          <h2 class="serif text-[22px]">Set up your sprint</h2>
          <label class="block hand text-xs">Source
            <select id="spSource" onchange="onSprintSource()" class="mt-1 w-full chip hand text-sm py-2">
              <option value="chapter">Chapter</option>
              <option value="due">Due queue</option>
              <option value="revise">Revise queue</option>
              <option value="company">Company Top 30d</option>
            </select>
          </label>
          <label id="spChapterWrap" class="block hand text-xs">Chapter
            <select id="spChapter" class="mt-1 w-full chip hand text-sm py-2">${chOpts}</select>
          </label>
          <label id="spCompanyWrap" class="hidden hand text-xs">Company
            <select id="spCompany" class="mt-1 w-full chip hand text-sm py-2">${coOpts}</select>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block hand text-xs">Questions
              <select id="spCount" class="mt-1 w-full chip hand text-sm py-2"><option>5</option><option selected>10</option><option>15</option><option>20</option></select>
            </label>
            <label class="block hand text-xs">Minutes
              <select id="spTime" class="mt-1 w-full chip hand text-sm py-2"><option>5</option><option selected>10</option><option>15</option><option>30</option></select>
            </label>
          </div>
          <button onclick="startSprint()" class="w-full bg-stone-900 text-amber-100 serif text-base py-2 rounded-full">Start sprint →</button>
          <p class="hand text-[11px] text-stone-500">Solved cards auto-ink as done at the finish. Keys: <span class="kbd">Y</span> solved • <span class="kbd">N</span> skip.</p>
        </div>
      </div>`;
    return;
  }
  if (sprint.phase === 'session'){
    const q = sprint.queue[sprint.idx];
    const remain = Math.max(0, Math.round((sprint.endsAt - Date.now()) / 1000));
    main.innerHTML = `
      <div class="paper rounded-2xl overflow-hidden">
        <div class="tape">Sprint • ${esc(sprint.srcLabel || '')} • ${sprint.idx + 1}/${sprint.queue.length}</div>
        <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="ml-0 lg:ml-10 mt-8 p-4 space-y-3">
          <div class="flex items-center gap-3">
            <p class="serif text-4xl" id="sprintClock">${fmtClock(remain)}</p>
            <div class="flex-1">
              <div class="w-full bg-stone-200 h-2 rounded-full border overflow-hidden"><div id="sprintTimeBar" class="bg-stone-900 h-2 rounded-full" style="width:${sprint.totalSecs ? Math.round((remain / sprint.totalSecs) * 100) : 0}%"></div></div>
              <p class="hand text-[11px] text-stone-500 mt-0.5">${sprint.results.filter((r) => r.outcome === 'solved').length} solved • ${sprint.results.filter((r) => r.outcome === 'skipped').length} skipped</p>
            </div>
            <button onclick="finishSprint(false)" class="chip hand text-xs">End</button>
          </div>
          <div class="paper rounded-2xl p-5 border text-center">
            <span class="chip hand text-[11px] ${q.difficulty === 'Easy' ? 'bg-emerald-50' : q.difficulty === 'Hard' ? 'bg-red-50' : 'bg-amber-50'}">${esc(q.difficulty || '—')}</span>
            <h3 class="serif text-2xl mt-2">${esc(q.title)}</h3>
            <p class="hand text-xs text-stone-500 mt-1">${esc(q.sub || '')}</p>
            <a target="_blank" href="${q.url}" class="inline-block mt-3 chip hand text-sm bg-sky-50">Open on LeetCode ↗</a>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="answerSprint('skipped')" class="bg-white border serif text-base py-2.5 rounded-full">Skip <span class="kbd">N</span></button>
            <button onclick="answerSprint('solved')" class="bg-stone-900 text-amber-100 serif text-base py-2.5 rounded-full">Solved ✓ <span class="kbd">Y</span></button>
          </div>
        </div>
      </div>`;
    return;
  }
  // done
  const solved = sprint.results.filter((r) => r.outcome === 'solved');
  const skipped = sprint.results.filter((r) => r.outcome !== 'solved');
  const pct = sprint.results.length ? Math.round((solved.length / sprint.results.length) * 100) : 0;
  const avg = sprint.results.length ? (sprint.results.reduce((a, r) => a + (r.secs || 0), 0) / sprint.results.length) : 0;
  main.innerHTML = `
    <div class="paper rounded-2xl overflow-hidden">
      <div class="tape">Sprint results • ${esc(sprint.srcLabel || '')}${sprint.timeUp ? ' • time up' : ''}</div>
      <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="ml-0 lg:ml-10 mt-8 p-4 space-y-3">
        <div class="flex items-end gap-3">
          <p class="serif text-5xl">${pct}%</p>
          <div class="hand text-sm pb-1.5"><b>${solved.length}/${sprint.results.length}</b> solved • avg ${Math.round(avg)}s/card</div>
        </div>
        ${skipped.length ? `<div><p class="hand text-xs tracking-widest text-stone-500 mb-1">REVIEW SKIPS (${skipped.length})</p><div class="space-y-1">${skipped.map((r) => `<div class="flex justify-between items-center border rounded-full px-3 py-1.5 bg-white"><span class="hand text-sm truncate">${esc(r.title)}</span><a target="_blank" href="${r.url}" class="chip hand text-[11px]">Solve ↗</a></div>`).join('')}</div></div>` : '<p class="hand text-sm">Flawless — nothing to review 🎉</p>'}
        ${solved.length ? `<div><p class="hand text-xs tracking-widest text-stone-500 mb-1">SOLVED & INKED (${solved.length})</p><div class="flex flex-wrap gap-1">${solved.map((r) => `<span class="chip hand text-[11px] bg-emerald-50">${esc(r.title)}</span>`).join('')}</div></div>` : ''}
        <div class="flex gap-1.5">
          <button onclick="quitSprint(); setView('sprint')" class="flex-1 bg-stone-900 text-amber-100 serif rounded-full py-2">New sprint →</button>
          <button onclick="quitSprint()" class="flex-1 bg-white border serif rounded-full py-2">Done</button>
        </div>
      </div>
    </div>`;
}
