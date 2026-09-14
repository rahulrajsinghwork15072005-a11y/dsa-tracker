// ---- Spaced repetition (SM-2 lite) ----
function srsToday(){ const t=new Date(); t.setHours(0,0,0,0); return t.getTime(); }
function resolveMeta(key){
  if(key.startsWith('LC')){
    const num=key.slice(2);
    const q=findQuestionByLC(num);
    if(q && q.title && !String(q.title).startsWith('LC')){
      const ch=DATA?DATA.chapters.find(c=>c.questions.some(x=>String(x.leetcode)===String(num))):null;
      return {title:q.title, sub:ch?('Ch '+String(ch.id).padStart(2,'0')+' • '+ch.title):'DSA', difficulty:q.difficulty||'', url:'https://leetcode.com/problems/'+(q.slug||slugify(q.title))+'/', lc:num};
    }
    return {title:'LC'+num, sub:'Company', difficulty:'', url:'https://leetcode.com/problems/'+slugify('LC'+num)+'/'};
  }
  if(key.startsWith('SLUG:')){
    const slug=key.slice(5);
    const cq=(typeof companyData!=='undefined' && companyData && companyData.questions||[]).find(x=>x.slug===slug);
    if(cq) return {title:cq.title, sub:((typeof companyData!=='undefined' && companyData && companyData.company)||'Company'), difficulty:cq.difficulty||'', url:'https://leetcode.com/problems/'+slug+'/', slug};
    return {title:slug, sub:'Company', difficulty:'', url:'https://leetcode.com/problems/'+slug+'/', slug};
  }
  return {title:key, sub:'', difficulty:'', url:''};
}
function nextInterval(key, grade){
  const r=(progress.srs&&progress.srs[key])||{ease:2.5,interval:0,reps:0};
  const ease=r.ease||2.5, iv=r.interval||0, reps=r.reps||0;
  if(grade==='again') return 0;
  if(grade==='hard') return Math.max(1,Math.round(iv*1.2)||1);
  if(grade==='good'){ const nr=reps+1; return nr<=1?1:nr===2?3:Math.max(1,Math.round((iv||1)*ease)); }
  const nr2=reps+1; return nr2<=1?4:Math.max(1,Math.round((iv||1)*ease*1.3));
}
function gradeQ(key, grade){
  const day=86400000, today=srsToday();
  if(!progress.srs) progress.srs={};
  const m=resolveMeta(key);
  const r=progress.srs[key]||{ease:2.5,interval:0,reps:0};
  r.t=m.title; r.sub=m.sub; if(m.slug) r.slug=m.slug; if(m.lc) r.lc=m.lc;
  const iv=nextInterval(key, grade);
  if(grade==='again'){ r.reps=0; r.interval=0; r.ease=Math.max(1.3,(r.ease||2.5)-0.2); r.due=today; progress.questions[key]='revise'; }
  else{
    r.reps=(r.reps||0)+1; r.interval=iv;
    if(grade==='hard') r.ease=Math.max(1.3,(r.ease||2.5)-0.15);
    if(grade==='easy') r.ease=Math.min(2.8,(r.ease||2.5)+0.15);
    r.due=today+iv*day; progress.questions[key]='done';
  }
  progress.srs[key]=r;
  progress._time[key]=Date.now();
  save(); renderSidebar(); render();
}
function dueItems(){
  const out=[], seen=new Set();
  const today=srsToday(), srs=progress.srs||{};
  for(const key of Object.keys(srs)){
    const r=srs[key];
    if(!r || r.due==null || r.due>today) continue;
    const m=resolveMeta(key);
    let chId=null, lcOrId=null, q=null, ch=null;
    if(key.startsWith('LC') && DATA){
      const num=key.slice(2);
      for(const c of DATA.chapters){ const f=c.questions.find(x=>String(x.leetcode)===String(num)); if(f){ ch=c; q=f; chId=c.id; lcOrId=(f.leetcode!=null?f.leetcode:f.id); break; } }
    }
    out.push({key, r, title:r.t||m.title, sub:r.sub||m.sub, difficulty:q?.difficulty||m.difficulty, url:m.url, chId, lcOrId});
    seen.add(key);
  }
  if(DATA) DATA.chapters.forEach(ch=> ch.questions.forEach(q=>{
    const key=qKey(q,ch.id);
    if(seen.has(key)) return;
    if(getQStatus(ch.id,q)==='revise'){ seen.add(key); out.push({key, r:srs[key]||null, title:q.title, sub:'Ch '+String(ch.id).padStart(2,'0')+' • '+ch.title, difficulty:q.difficulty, url:lcUrl(q), chId:ch.id, lcOrId:(q.leetcode!=null?q.leetcode:q.id)}); }
  }));
  out.sort((a,b)=> ((a.r&&a.r.due!=null)?a.r.due:today)-((b.r&&b.r.due!=null)?b.r.due:today));
  return out;
}
function countDue(){ try{ return dueItems().length; }catch{ return 0; } }
function setDueStatus(key, status, chId, lcOrId){
  if(chId!=null && lcOrId!==undefined && lcOrId!==null && DATA){
    const ch=DATA.chapters.find(c=>c.id===Number(chId));
    const q=ch?.questions.find(x=>String(x.leetcode!=null?x.leetcode:x.id)===String(lcOrId));
    if(q){ setQStatus(ch.id,q,status); return; }
  }
  progress.questions[key]=status; progress._time[key]=Date.now(); save(); render();
}
function dueLabel(it, today){
  if(!it.r || it.r.due==null) return 'Starred';
  const d=Math.round((today-it.r.due)/86400000);
  if(d<=0) return 'Today';
  return d+'d overdue';
}
function exportAnki(){
  const items=dueItems();
  const rows=[['Front','Back']];
  items.forEach(it=>{
    const m=resolveMeta(it.key);
    const front=((it.title||it.key)+' — '+(it.sub||'')).replace(/[\t\n\r]+/g,' ');
    const back=[it.difficulty||'', 'Notes: '+(progress.notes[it.key]||'—'), m.url||''].join('\n').replace(/\t/g,' ');
    rows.push([front, back]);
  });
  const blob=new Blob([rows.map(r=>r.join('\t')).join('\n')],{type:'text/tab-separated-values'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='anki-dsa-'+new Date().toISOString().slice(0,10)+'.tsv'; a.click();
  toast('Exported '+(rows.length-1)+' Anki cards');
}
function markCompanyPageDone(){
  if(!companyData||!companyData.questions) return;
  companyData.questions.forEach(q=>{
    const key=q.lcId? 'LC'+q.lcId : 'SLUG:'+q.slug;
    progress.questions[key]='done'; progress._time[key]=Date.now();
    q.status='done';
  });
  save(); render();
  toast('Page marked done ✓');
}
function renderDiffStrip(){
  const el=document.getElementById('diffStrip');
  if(!el || !DATA) return;
  const diffs={Easy:[0,0],Medium:[0,0],Hard:[0,0]};
  const seen=new Set();
  DATA.chapters.forEach(c=>c.questions.forEach(q=>{
    const k=q.leetcode?'LC'+q.leetcode:c.id+'-'+q.id;
    if(seen.has(k)) return; seen.add(k);
    const d=q.difficulty||'Medium';
    if(!diffs[d]) diffs[d]=[0,0];
    diffs[d][1]++;
    if(getQStatus(c.id,q)==='done') diffs[d][0]++;
  }));
  const colors={Easy:'bg-emerald-500',Medium:'bg-amber-500',Hard:'bg-red-500'};
  el.innerHTML='<span class="tracking-widest text-[10px]">BY LEVEL</span>'+Object.keys(diffs).map(d=>{
    const [done,total]=diffs[d];
    const pct=total?Math.round(done/total*100):0;
    return `<span class="flex items-center gap-1.5"><b>${d[0]}</b> ${done}/${total}<span class="inline-block w-16 h-1.5 bg-stone-200 rounded-full overflow-hidden align-middle"><span class="block h-1.5 ${colors[d]}" style="width:${pct}%"></span></span><span class="opacity-60">${pct}%</span></span>`;
  }).join('');
}

