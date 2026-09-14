// ---- Global knowledge search (titles, topics, PDF notes, reference, your notes) ----
let KBLOB = null;
function kbBuild(){
  if(KBLOB || !DATA) return;
  KBLOB = DATA.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    _title: ch.title.toLowerCase(),
    topics: (ch.topics || []).map((t, i) => ({ t, i, _t: t.toLowerCase() })),
    questions: (ch.questions || []).map((q) => ({
      title: q.title, lc: q.leetcode, id: q.id,
      key: q.leetcode ? 'LC' + q.leetcode : ch.id + '-' + q.id,
      _t: q.title.toLowerCase(),
    })),
    pdf: {
      overview: (ch.pdfNotes && ch.pdfNotes.overview) || '',
      templates: (ch.pdfNotes && ch.pdfNotes.templates) || '',
      cheatSheet: (ch.pdfNotes && ch.pdfNotes.cheatSheet) || '',
      patternChecklist: (ch.pdfNotes && ch.pdfNotes.patternChecklist) || '',
    },
    ref: ch.referenceText || '',
  }));
  KBLOB.forEach((e) => {
    e._pdf = {};
    for (const k in e.pdf) e._pdf[k] = e.pdf[k].toLowerCase();
    e._ref = e.ref.toLowerCase();
  });
}
function kbSnippet(text, q){
  const t = String(text || '');
  const i = t.toLowerCase().indexOf(q);
  if (i < 0) return esc(t.slice(0, 80));
  const s = Math.max(0, i - 40);
  return (s > 0 ? '…' : '') + esc(t.slice(s, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length, i + q.length + 40)) + (i + q.length + 40 < t.length ? '…' : '');
}
function searchKnowledge(rawQ){
  kbBuild();
  const q = (rawQ || '').toLowerCase().trim();
  if (!KBLOB || q.length < 2) return [];
  const buckets = { title: [], question: [], topic: [], note: [], pdf: [], ref: [] };
  const chL = (id) => 'Ch ' + String(id).padStart(2, '0');
  for (const e of KBLOB){
    if (e._title.includes(q)) buckets.title.push({ score: 100, raw: true,
      label: `<b>${esc(e.title)}</b> <span class="opacity-60">— ${chL(e.id)} chapter</span>`,
      desc: { t: 'ch', id: e.id, tab: 'questions', label: `${e.title} (chapter)` } });
    for (const qu of e.questions){
      if (qu._t.includes(q) || String(qu.lc || '').includes(q)) buckets.question.push({ score: 90, raw: true,
        label: `<b>LC${qu.lc || '—'} ${esc(qu.title)}</b> <span class="opacity-60">— ${chL(e.id)}</span>`,
        desc: { t: 'q', ch: e.id, tab: 'questions', label: `LC${qu.lc || ''} ${qu.title} — ${chL(e.id)}` } });
    }
    if (buckets.title.length + buckets.question.length + buckets.topic.length + buckets.note.length + buckets.pdf.length + buckets.ref.length > 500) break;
    for (const tp of e.topics){
      if (tp._t.includes(q)) buckets.topic.push({ score: 70, raw: true,
        label: `▤ <b>${esc(tp.t)}</b> <span class="opacity-60">— topic · ${chL(e.id)}</span>`,
        desc: { t: 'ch', id: e.id, tab: 'topics', label: `topic ${tp.t}` } });
    }
    const pdfNames = { overview: 'Overview', templates: 'Templates', cheatSheet: 'Cheat Sheet', patternChecklist: 'Checklist' };
    for (const k in e.pdf){
      if (e.pdf[k] && e._pdf[k].includes(q)) buckets.pdf.push({ score: 50, raw: true,
        label: `📄 <b>${pdfNames[k]}</b> <span class="opacity-60">— ${chL(e.id)}</span><br><span class="opacity-60" style="font-size:11px">${kbSnippet(e.pdf[k], q)}</span>`,
        desc: { t: 'ch', id: e.id, tab: 'pdf', pdfTab: k, label: `${pdfNames[k]} ${chL(e.id)}` } });
    }
    if (e.ref && e._ref.includes(q)) buckets.ref.push({ score: 30, raw: true,
      label: `📖 <b>Reference</b> <span class="opacity-60">— ${chL(e.id)}</span><br><span class="opacity-60" style="font-size:11px">${kbSnippet(e.ref, q)}</span>`,
      desc: { t: 'ch', id: e.id, tab: 'pdf', pdfTab: 'reference', label: `Reference ${chL(e.id)}` } });
    const cn = progress.chapterNotes && progress.chapterNotes[e.id];
    if (cn && cn.toLowerCase().includes(q)) buckets.note.push({ score: 60, raw: true,
      label: `✎ <b>Your note</b> <span class="opacity-60">— ${chL(e.id)}</span><br><span class="opacity-60" style="font-size:11px">${kbSnippet(cn, q)}</span>`,
      desc: { t: 'ch', id: e.id, tab: 'notes', label: `my note ${chL(e.id)}` } });
    for (const tp of e.topics){
      const tn = progress.topicNotes && progress.topicNotes[e.id + '-' + tp.i];
      if (tn && tn.toLowerCase().includes(q)) buckets.note.push({ score: 60, raw: true,
        label: `✎ <b>Topic note: ${esc(tp.t)}</b> <span class="opacity-60">— ${chL(e.id)}</span>`,
        desc: { t: 'ch', id: e.id, tab: 'topics', label: `topic note ${tp.t}` } });
    }
    for (const qu of e.questions){
      const nt = progress.notes && progress.notes[qu.key];
      if (nt && nt.toLowerCase().includes(q)) buckets.note.push({ score: 60, raw: true,
        label: `✎ <b>${esc(qu.title)}</b> <span class="opacity-60">note — ${chL(e.id)}</span><br><span class="opacity-60" style="font-size:11px">${kbSnippet(nt, q)}</span>`,
        desc: { t: 'q', ch: e.id, tab: 'questions', label: `note ${qu.title}` } });
    }
  }
  for (const k in buckets) buckets[k].sort((a, b) => b.score - a.score);
  const order = ['title', 'question', 'topic', 'note', 'pdf', 'ref'];
  const merged = [];
  let bi = 0, added = true;
  while (merged.length < 6 && added){
    added = false;
    for (const k of order){
      if (buckets[k][bi] !== undefined){ merged.push(buckets[k][bi]); added = true; }
    }
    bi++;
  }
  return merged;
}
