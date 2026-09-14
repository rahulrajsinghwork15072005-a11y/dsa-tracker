function save(){ persistProgress(); renderStats(); }
function qKey(q,chId){ if(q.leetcode) return 'LC'+q.leetcode; return chId+'-'+q.id; }
function getQStatus(chId,q){
  // Always use LC key as source of truth when available — dedupToggle only affects *filtering* not storage
  if(q.leetcode){
    const lcKey='LC'+q.leetcode;
    if(progress.questions[lcKey]!==undefined) return progress.questions[lcKey];
    // fallback for legacy ch-specific keys (migrated data)
    const legacyKey=chId+'-'+q.leetcode;
    if(progress.questions[legacyKey]!==undefined) return progress.questions[legacyKey];
    const legacyKey2=chId+'-LC'+q.leetcode;
    if(progress.questions[legacyKey2]!==undefined) return progress.questions[legacyKey2];
  }
  const key = q.leetcode ? 'LC'+q.leetcode : chId+'-'+q.id;
  return progress.questions[key]||'todo';
}
function setQStatus(chId,q,status){
  // Always store under LC key when possible — ensures dedupToggle doesn't create split brain
  const key = q.leetcode ? 'LC'+q.leetcode : chId+'-'+q.id;
  const prev=progress.questions[key];
  const ch0=DATA.chapters.find(c=>c.id===chId);
  const beforePct=ch0?chapterProgress(ch0):0;
  progress.questions[key]=status;
  progress._time[key]=Date.now();
  // keep legacy ch-specific key in sync for old exports (optional cleanup)
  if(q.leetcode){
    const legacy=chId+'-'+q.leetcode;
    if(progress.questions[legacy]!==undefined && legacy!==key) delete progress.questions[legacy];
  }
  // proper selection feedback: if toggling via checkbox, also update board if open
  save(); renderSidebar(); render();
  if(view==='board' && typeof boardDrawConnections==='function') boardDrawConnections();
  if(status==='done') checkChapterMilestone(chId, beforePct);
}
function checkChapterMilestone(chId, beforePct){
  const ch=DATA.chapters.find(c=>c.id===chId);
  if(!ch) return;
  if(!progress._milestones) progress._milestones={};
  if(chapterProgress(ch)===100 && (beforePct||0)<100 && !progress._milestones['ch'+chId]){
    progress._milestones['ch'+chId]=1; persistProgress();
    toast('Chapter '+String(chId).padStart(2,'0')+' complete — '+ch.title+' ✓');
  }
}
function isTopicDone(chId,ti){ return !!progress.topics[chId+'-'+ti]; }
function toggleTopic(chId,ti){ const k=chId+'-'+ti; const ch=DATA.chapters.find(c=>c.id===chId); const before=ch?chapterProgress(ch):0; progress.topics[k]=!progress.topics[k]; progress._time[k]=Date.now(); save(); renderSidebar(); render(); checkChapterMilestone(chId, before); }
function toggleAll(el,chId){
  const ch=DATA.chapters.find(c=>c.id===chId);
  const target=el.checked?'done':'todo';
  // batch update without per-item render
  ch.questions.forEach(q=>{
    const key=q.leetcode ? 'LC'+q.leetcode : chId+'-'+q.id;
    progress.questions[key]=target;
    progress._time[key]=Date.now();
  });
  save(); renderSidebar(); render();
}
function isAllDone(chId, qs){
  return qs.length>0 && qs.every(q=> getQStatus(chId,q)==='done');
}
function chapterProgress(ch){
  const qs=ch.questions||[]; if(!qs.length) return 0;
  let done=0; qs.forEach(q=>{ if(getQStatus(ch.id,q)==='done') done++; });
  const tDone=(ch.topics||[]).filter((_,i)=>isTopicDone(ch.id,i)).length;
  return Math.round((done/qs.length)*70 + (tDone/(ch.topics.length||1))*30);
}
function isChapterDone(ch){ return chapterProgress(ch)===100; }
function streakDays(){
  const times=Object.values(progress._time||{}); if(!times.length) return 0;
  const days=new Set(times.map(t=> new Date(t).toDateString()));
  // simple streak: count consecutive days ending today
  let streak=0; let d=new Date();
  while(true){
    if(days.has(d.toDateString())){ streak++; d.setDate(d.getDate()-1); } else break;
    if(streak>60) break;
  }
  return streak;
}
function renderHeatmap(){
  const el=document.getElementById('heatmap');
  if(!el) return;
  const counts={};
  Object.values(progress._time||{}).forEach(t=>{ const d=new Date(t); const k=d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); counts[k]=(counts[k]||0)+1; });
  const today=new Date(); today.setHours(0,0,0,0);
  const start=new Date(today); start.setDate(start.getDate()-83);
  let html='';
  for(let w=0;w<12;w++){
    html+='<div class="flex flex-col gap-[3px]">';
    for(let d=0;d<7;d++){
      const dt=new Date(start); dt.setDate(start.getDate()+w*7+d);
      if(dt>today){ html+='<div class="w-[9px] h-[9px]"></div>'; continue; }
      const k=dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate();
      const n=counts[k]||0;
      const cls=n===0?'bg-stone-200':n<=2?'bg-amber-200':n<=5?'bg-amber-400':'bg-stone-900';
      html+=`<div class="w-[9px] h-[9px] rounded-[2px] ${cls}" title="${dt.toDateString()} • ${n}"></div>`;
    }
    html+='</div>';
  }
  el.innerHTML=html;
}
function nextUpChapter(){
  // Target mode: prioritize company's top freq todo
  if(progress.companyPrefs && progress.companyPrefs.target && companyData && selectedCompany===progress.companyPrefs.target){
    const td=companyData.questions?.find(q=> {
      const key=q.lcId? 'LC'+q.lcId : 'SLUG:'+q.slug;
      const st=(q.lcId && progress.questions['LC'+q.lcId]) ? progress.questions['LC'+q.lcId] : (progress.questions[key]||'todo');
      // respect companyData's status if injected
      const s=q.status||st;
      return s==='todo';
    });
    if(td){
      // find which chapter contains this q if any (for display)
      let chFound=null;
      if(td.lcId){
        for(const c of DATA.chapters){ if(c.questions.some(x=> x.leetcode===td.lcId)){ chFound=c; break; } }
      }
      return {ch: chFound||{id:0, title: selectedCompany+' • '+selectedTimeframe}, q: td, isCompany:true};
    }
  }
  // first todo in activeChapter else first todo globally
  let ch=DATA.chapters.find(c=>c.id===activeChapter);
  if(ch){
    const todo=ch.questions.find(q=> getQStatus(ch.id,q)==='todo');
    if(todo) return {ch, q:todo};
  }
  for(const c of DATA.chapters){
    const todo=c.questions.find(q=> getQStatus(c.id,q)==='todo');
    if(todo) return {ch:c, q:todo};
  }
  return null;
}
function renderStats(){
  const allRows=DATA.chapters.reduce((a,c)=>a+c.questions.length,0);
  const uniqSet=new Set(DATA.chapters.flatMap(c=>c.questions.map(q=> q.leetcode? 'LC'+q.leetcode : c.id+'-'+q.id)));
  const uniqTotal=uniqSet.size;
  let doneRows=0, reviseRows=0;
  DATA.chapters.forEach(c=> c.questions.forEach(q=>{ const s=getQStatus(c.id,q); if(s==='done') doneRows++; if(s==='revise') reviseRows++; }));
  const uniqDone=new Set(); DATA.chapters.forEach(c=> c.questions.forEach(q=>{ if(getQStatus(c.id,q)==='done') uniqDone.add(q.leetcode? 'LC'+q.leetcode : c.id+'-'+q.id); }));
  const pct= uniqTotal? Math.round(uniqDone.size/uniqTotal*100):0;
  document.getElementById('overallPctH').textContent=pct+'%';
  document.getElementById('overallBar').style.width=pct+'%';
  document.getElementById('dashBar').style.width=pct+'%';
  const ring=document.getElementById('statRing');
  if(ring) ring.style.strokeDashoffset=(163.3*(1-pct/100)).toFixed(1);
  if(!progress._milestones) progress._milestones={};
  if(window._lastPct!==undefined){
    for(const m of [25,50,75,100]){
      if(window._lastPct<m && pct>=m && !progress._milestones['p'+m]){
        progress._milestones['p'+m]=1; persistProgress();
        toast(m===100?'100% — DSA inked. Take the interview. 🏆':m+'% inked — keep going ✒️');
      }
    }
  }
  window._lastPct=pct;
  const dd=document.getElementById('dueCount'); if(dd) dd.textContent=countDue();
  renderDiffStrip();
  document.getElementById('doneCount').textContent=uniqDone.size; // unique done
  document.getElementById('reviseCount').textContent=reviseRows;
  document.getElementById('remainCount').textContent=uniqTotal-uniqDone.size;
  document.getElementById('statPct').textContent=pct+'%';
  document.getElementById('statDone').textContent=uniqDone.size;
  document.getElementById('statLeft').textContent=uniqTotal-uniqDone.size;
  document.getElementById('totalQ').textContent=allRows;
  document.getElementById('uniqueQ').textContent=uniqTotal;
  document.getElementById('chaptersDone').textContent=DATA.chapters.filter(isChapterDone).length+'/56';
  document.getElementById('chapterProgress').style.width=Math.round(DATA.chapters.filter(isChapterDone).length/56*100)+'%';
  const st=streakDays();
  document.getElementById('streak').textContent=st+'🔥';
  document.getElementById('streakSub').textContent= st? `${st} day ink streak` : 'ink daily to keep';
  const nu=nextUpChapter();
  if(nu && nu.isCompany){
    document.getElementById('nextUp').textContent= `${nu.q.title} — ${nu.ch.title} [${nu.q.frequency?.toFixed(1)||''} freq]`;
    document.getElementById('focusText').textContent= `Target: ${progress.companyPrefs.target} • ${nu.q.difficulty} • LC${nu.q.lcId||''}`;
  } else {
    document.getElementById('nextUp').textContent= nu? `${String(nu.ch.id).padStart(2,'0')}. ${nu.q.title} — ${nu.ch.title}` : 'All caught up — pick Revise';
    document.getElementById('focusText').textContent= nu? `Next: Ch ${String(nu.ch.id).padStart(2,'0')} • ${nu.q.difficulty}` : 'Review revise queue';
  }
  renderHeatmap();
}
function renderSidebar(){
  const el=document.getElementById('phaseList');
  el.innerHTML='';
  const q=searchQ.toLowerCase();
  PHASES.forEach(ph=>{
    const chs=DATA.chapters.filter(c=> c.id>=ph.range[0] && c.id<=ph.range[1]);
    // filter by search
    const visible= chs.filter(ch=>{
      if(!q) return true;
      const hay=(ch.title+' '+(ch.topics||[]).join(' ')+' '+(ch.questions||[]).map(x=>x.title).join(' ')).toLowerCase();
      return hay.includes(q);
    });
    if(!visible.length && q) return;
    const progAvg=Math.round(visible.reduce((a,c)=>a+chapterProgress(c),0)/ (visible.length||1));
    const doneCount=visible.filter(isChapterDone).length;
    const collapsed=phaseCollapsed[ph.name];
    const wrap=document.createElement('div');
    wrap.className='paper rounded-xl p-2';
    wrap.innerHTML=`
      <button onclick="togglePhase('${ph.name}')" class="w-full flex justify-between items-center">
        <div class="text-left">
          <div class="serif text-sm">${ph.name} <span class="hand text-[11px] text-stone-500">${ph.range[0]}–${ph.range[1]}</span></div>
          <div class="hand text-[11px] text-stone-500">${ph.desc}</div>
        </div>
        <div class="text-right">
          <div class="hand text-xs">${doneCount}/${visible.length} • ${progAvg}%</div>
          <i class="fa-solid ${collapsed?'fa-chevron-down':'fa-chevron-up'} text-[10px] text-stone-400"></i>
        </div>
      </button>
      <div class="w-full bg-stone-100 h-1 rounded-full mt-1.5"><div class="bg-stone-900 h-1 rounded-full" style="width:${progAvg}%"></div></div>
      <div class="${collapsed?'hidden':''} mt-2 space-y-1">
        ${visible.map(ch=>{
          const prog=chapterProgress(ch);
          const active=ch.id===activeChapter && view==='chapters';
          return `<button onclick="selectChapter(${ch.id})" class="w-full text-left border rounded-full px-2.5 py-1.5 flex justify-between items-center hover:bg-amber-50 ${active?'bg-stone-900 text-amber-100 border-stone-900': 'bg-white'}">
            <span class="hand text-xs leading-tight">${String(ch.id).padStart(2,'0')}. ${ch.title}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full border hand ${active?'bg-white text-stone-900':'bg-stone-900 text-white'}">${prog}%</span>
          </button>`;
        }).join('')}
      </div>
    `;
    el.appendChild(wrap);
  });
}
function togglePhase(name){ phaseCollapsed[name]=!phaseCollapsed[name]; renderSidebar(); }
function selectChapter(id){ activeChapter=id; view='chapters'; updateViewBtns(); render(); }
function updateViewBtns(){
  document.getElementById('btnChapters').className = view==='chapters'?'serif text-sm py-1.5 rounded-full bg-stone-900 text-amber-100':'serif text-sm py-1.5 rounded-full bg-white border';
  document.getElementById('btnCompanies').className = view==='companies'?'serif text-sm py-1.5 rounded-full bg-stone-900 text-amber-100':'serif text-sm py-1.5 rounded-full bg-white border';
  document.getElementById('btnAll').className = view==='all'?'serif text-sm py-1.5 rounded-full bg-stone-900 text-amber-100':'serif text-sm py-1.5 rounded-full bg-white border';
  document.getElementById('btnRevise').className = view==='revise'?'serif text-sm py-1.5 rounded-full bg-amber-600 text-white':'serif text-sm py-1.5 rounded-full bg-white border';
  const bBoard=document.getElementById('btnBoard');
  if(bBoard) bBoard.className = view==='board'?'w-full serif text-sm py-1.5 rounded-full bg-stone-900 text-amber-100':'w-full serif text-sm py-1.5 rounded-full bg-amber-200 border border-amber-300 hover:bg-amber-300';
  const bDue=document.getElementById('btnDue');
  if(bDue) bDue.className = view==='due'?'w-full serif text-sm py-1.5 rounded-full bg-amber-600 text-white':'w-full serif text-sm py-1.5 rounded-full bg-white border';
  const bSprint=document.getElementById('btnSprint');
  if(bSprint) bSprint.className = view==='sprint'?'w-full serif text-sm py-1.5 rounded-full bg-stone-900 text-amber-100':'w-full serif text-sm py-1.5 rounded-full bg-white border';
  document.body.classList.toggle('board-mode', view==='board');
  const picker=document.getElementById('companyPicker');
  if(picker) picker.classList.toggle('hidden', view!=='companies');
  const phaseList=document.getElementById('phaseList');
  if(phaseList) phaseList.classList.toggle('hidden', view==='companies' || view==='board');
  const mini=document.getElementById('companyMini');
  if(mini) mini.classList.toggle('hidden', view==='companies' || view==='board');
  const bCtrl=document.getElementById('boardControls');
  if(bCtrl) bCtrl.classList.toggle('hidden', view!=='board');
  const dash=document.getElementById('dashboardGrid');
  if(dash) dash.classList.toggle('hidden', view==='board');
  const mainC=document.getElementById('mainContent');
  if(mainC) mainC.classList.toggle('hidden', view==='board');
  const boardV=document.getElementById('boardViewport');
  if(boardV) boardV.classList.toggle('hidden', view!=='board');
}
function setView(v){
  view=v;
  updateViewBtns();
  if(v==='companies'){
    if(!companiesMeta) loadCompaniesMeta();
    if(!companyData) loadCompanyData();
  }
  if(v==='board'){
    setTimeout(()=>{
      if(boardCards.length===0){
        const saved=localStorage.getItem('board-layout-v1');
        if(saved) boardLoad();
        if(boardCards.length===0){
          boardAddCard('welcome');
          boardAddCard('stats');
          boardAddCard('nextup');
        }
      }
      updateBoardTransform();
      boardDrawConnections();
    }, 50);
  }
  render();
}
function onSearch(){ searchQ=document.getElementById('search').value; renderSidebar(); render(); }
function clearFilters(){ document.getElementById('search').value=''; document.getElementById('filterDiff').value=''; document.getElementById('filterStatus').value=''; searchQ=''; renderSidebar(); render(); }
function slugify(t){ return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'search'; }
function lcUrl(q){ if(q.slug) return 'https://leetcode.com/problems/'+q.slug+'/'; if(q.leetcode && window.lcIdToSlug && window.lcIdToSlug[String(q.leetcode)]) return 'https://leetcode.com/problems/'+window.lcIdToSlug[String(q.leetcode)]+'/'; return 'https://leetcode.com/problems/'+slugify(q.title)+'/'; }
function wUrl(w){ if(window.lcIdToSlug && window.lcIdToSlug[String(w.num)]) return 'https://leetcode.com/problems/'+window.lcIdToSlug[String(w.num)]+'/'; return 'https://leetcode.com/problems/'+slugify(w.title)+'/'; }
function goNext(){
  const nu=nextUpChapter();
  if(!nu) return;
  if(nu.isCompany){
    view='companies';
    selectedCompany=progress.companyPrefs.target;
    selectedTimeframe=progress.companyPrefs.timeframe||'30d';
    updateViewBtns();
    loadCompanyData();
    window.scrollTo({top:0, behavior:'smooth'});
  } else {
    activeChapter=nu.ch.id; view='chapters'; updateViewBtns(); render(); window.scrollTo({top:0, behavior:'smooth'});
  }
}
function openCmd(){ document.getElementById('cmd').classList.remove('hidden'); document.getElementById('cmdInput').focus(); cmdSearch(''); }
function closeCmd(e){ if(e.target.id==='cmd') document.getElementById('cmd').classList.add('hidden'); if(e.key==='Escape') document.getElementById('cmd').classList.add('hidden'); }
document.addEventListener('keydown', e=>{
  if((e.metaKey||e.ctrlKey)&& e.key==='k'){ e.preventDefault(); openCmd(); }
  if(e.key==='/' && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){ e.preventDefault(); document.getElementById('search').focus(); }
  if(e.key==='Escape'){ document.getElementById('cmd').classList.add('hidden'); closeAuth(); closeLcPaste(); }
  if(view==='chapters' && !e.metaKey && !e.ctrlKey && document.activeElement.tagName!=='INPUT'){
    if(e.key==='j'){ activeChapter=Math.min(56, activeChapter+1); renderSidebar(); render(); }
    if(e.key==='k'){ activeChapter=Math.max(1, activeChapter-1); renderSidebar(); render(); }
    if(e.key==='c'){ const ch=DATA.chapters.find(c=>c.id===activeChapter); const todo=ch.questions.find(q=> getQStatus(ch.id,q)==='todo'); if(todo) setQStatus(ch.id, todo, 'done'); }
    if(e.key==='r'){ const ch=DATA.chapters.find(c=>c.id===activeChapter); const todo=ch.questions.find(q=> getQStatus(ch.id,q)==='todo'); if(todo) setQStatus(ch.id, todo, 'revise'); }
  }
  if(view==='sprint' && sprint && sprint.phase==='session' && !e.metaKey && !e.ctrlKey && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA' && document.activeElement.tagName!=='SELECT'){
    if(e.key==='y') answerSprint('solved');
    if(e.key==='n') answerSprint('skipped');
  }
});
function cmdSearch(q){
  const list=document.getElementById('cmdList');
  q=q.toLowerCase();
  let items=[];
  DATA.chapters.forEach(ch=>{
    if(ch.title.toLowerCase().includes(q) || String(ch.id).includes(q)) items.push({label:`${String(ch.id).padStart(2,'0')}. ${ch.title} — ${ch.questions.length} Qs`, desc:{t:'ch', id:ch.id}});
    ch.questions.forEach(qu=>{
      if(qu.title.toLowerCase().includes(q) || String(qu.leetcode).includes(q)) items.push({label:`LC${qu.leetcode||'—'} ${qu.title} — Ch ${String(ch.id).padStart(2,'0')}`, desc:{t:'q', ch:ch.id}});
    });
  });
  if(companiesMeta && companiesMeta.companies){
    companiesMeta.companies.forEach(c=>{
      if(c.name.toLowerCase().includes(q) || c.slug.includes(q)) items.push({label:`🏢 ${c.name} — ${c.counts.all} Qs • 30d:${c.counts['30d']||0}`, desc:{t:'co', slug:c.slug}});
    });
  }
  items.forEach(it=> it.desc.label=it.label);
  if(!q && progress.recent && progress.recent.length){
    const recents=progress.recent.map(r=> ({label:'↻ '+r.label, desc:r}));
    const seen=new Set(recents.map(x=> x.label));
    items=[...recents, ...items.filter(it=> !seen.has(it.label))].slice(0,14);
  } else items=items.slice(0,12);
  if(q && q.length>=2){
    const have=new Set(items.map(it=> it.desc.t+'|'+(it.desc.id||'')+'|'+(it.desc.ch||'')+'|'+(it.desc.label||'')));
    for(const k of searchKnowledge(q)){
      const sig=k.desc.t+'|'+(k.desc.id||'')+'|'+(k.desc.ch||'')+'|'+(k.desc.label||'');
      if(!have.has(sig)){ have.add(sig); items.push(k); }
    }
    items=items.slice(0,18);
  }
  list.innerHTML=items.map((it)=> `<button class="w-full text-left px-3 py-2 rounded-full border hover:bg-amber-50 hand text-sm">${it.raw?it.label:esc(it.label)}</button>`).join('') || '<p class="hand text-sm p-3 text-stone-400">No match — try a chapter number or company</p>';
  list.querySelectorAll('button').forEach((b,i)=> b.onclick=()=> cmdGo(items[i].desc));
  cmdActive=0; cmdHighlight();
}
function cmdGo(d){
  if(!d) return;
  const chId=d.t==='ch'?d.id:d.ch;
  if(chId!=null){
    if(d.tab && window.chTab) window.chTab[chId]=d.tab;
    if(d.pdfTab && window.pdfTab) window.pdfTab[chId]=d.pdfTab;
  }
  if(d.t==='ch'){ selectChapter(d.id); }
  else if(d.t==='q'){ activeChapter=d.ch; view='chapters'; updateViewBtns(); render(); }
  else if(d.t==='co'){ selectedCompany=d.slug; view='companies'; updateViewBtns(); loadCompanyData(); }
  document.getElementById('cmd').classList.add('hidden');
  pushRecent(d);
}
function pushRecent(d){
if(!progress.recent) progress.recent=[];
if(!progress._milestones) progress._milestones={};
if(!progress.srs) progress.srs={};
  const key=JSON.stringify({t:d.t, id:d.id, ch:d.ch, slug:d.slug, tab:d.tab, pdfTab:d.pdfTab});
  progress.recent=progress.recent.filter(r=> JSON.stringify({t:r.t, id:r.id, ch:r.ch, slug:r.slug, tab:r.tab, pdfTab:r.pdfTab})!==key);
  progress.recent.unshift({t:d.t, id:d.id, ch:d.ch, slug:d.slug, tab:d.tab, pdfTab:d.pdfTab, label:d.label||''});
  progress.recent=progress.recent.slice(0,8);
  save();
}
function cmdKey(e){
  const btns=document.querySelectorAll('#cmdList button');
  if(e.key==='ArrowDown'){ e.preventDefault(); cmdActive=Math.min(btns.length-1, cmdActive+1); cmdHighlight(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); cmdActive=Math.max(0, cmdActive-1); cmdHighlight(); }
  else if(e.key==='Enter'){ const b=btns[cmdActive]; if(b) b.click(); }
}
function cmdHighlight(){
  document.querySelectorAll('#cmdList button').forEach((b,i)=> b.classList.toggle('bg-amber-100', i===cmdActive));
}

