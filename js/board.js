let boardPan={x:0,y:0}, boardScale=1, boardCards=[], boardNextId=1, boardDragging=null, boardResizing=null, boardLoading=false, boardPanning=false, boardPanStart={x:0,y:0}, boardConnections=[];
function boardSave(){
  const data=boardCards.map(c=> ({id:c.id, type:c.type, key:c.key, x:c.x, y:c.y, w:c.w, h:c.h}));
  const links=boardConnections.map(l=>{
    const f=boardCards.find(c=>c.id===l.from), t=boardCards.find(c=>c.id===l.to);
    return (f&&t)?{ft:f.type, fk:String(f.key), tt:t.type, tk:String(t.key)}:null;
  }).filter(Boolean);
  localStorage.setItem('board-layout-v1', JSON.stringify({pan:boardPan, scale:boardScale, cards:data, links}));
}
function boardLoad(){
  try{
    const raw=localStorage.getItem('board-layout-v1');
    if(!raw) return;
    const j=JSON.parse(raw);
    if(j.pan) boardPan=j.pan;
    if(j.scale) boardScale=j.scale;
    updateBoardTransform();
    boardLoading=true;
    if(j.cards && j.cards.length){
      j.cards.forEach(c=>{
        if(c.type==='welcome') boardAddCard('welcome', c.x, c.y, c.w, c.h, false);
        else if(c.type==='stats') boardAddCard('stats', c.x, c.y, c.w, c.h, false);
        else if(c.type==='nextup') boardAddCard('nextup', c.x, c.y, c.w, c.h, false);
        else if(c.type==='chapter') boardAddCard('chapter', c.key, c.x, c.y, c.w, c.h, false);
        else if(c.type==='company') boardAddCard('company', c.key, c.x, c.y, c.w, c.h, false);
        else if(c.type==='question') boardAddCard('question', c.key, c.x, c.y, c.w, c.h, false);
        else if(c.type==='phase') boardAddCard('phase', c.key, c.x, c.y, c.w, c.h, false);
      });
    }
    boardLoading=false;
    (j.links||[]).forEach(l=>{
      const f=boardCards.find(c=>c.type===l.ft && String(c.key)===String(l.fk));
      const t=boardCards.find(c=>c.type===l.tt && String(c.key)===String(l.tk));
      if(f && t && f.id!==t.id && !boardConnections.some(x=>x.from===f.id&&x.to===t.id)) boardConnections.push({from:f.id, to:t.id});
    });
    boardDrawConnections();
  }catch(e){ boardLoading=false; console.log('boardLoad fail', e); }
}
function updateBoardTransform(){
  const b=document.getElementById('board');
  if(b) b.style.transform=`translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardScale})`;
  boardRenderMini();
}
function boardRenderMini(){
  const dots=document.getElementById('boardMiniCards');
  const view=document.getElementById('boardMiniView');
  const vp=document.getElementById('boardViewport');
  if(!dots || !view || !vp) return;
  const S=0.02;
  dots.innerHTML=boardCards.map(c=> `<div class="absolute rounded-[1px] ${c.type==='phase'?'bg-amber-400':'bg-stone-900'}" style="left:${c.x*S}px;top:${c.y*S}px;width:${Math.max(2,c.w*S)}px;height:${Math.max(2,c.h*S)}px"></div>`).join('');
  const w=vp.clientWidth/boardScale*S, h=vp.clientHeight/boardScale*S;
  view.style.left=(-boardPan.x/boardScale*S)+'px';
  view.style.top=(-boardPan.y/boardScale*S)+'px';
  view.style.width=w+'px'; view.style.height=h+'px';
}
function boardMiniJump(e){
  const inner=document.getElementById('boardMiniInner');
  const vp=document.getElementById('boardViewport');
  if(!inner || !vp) return;
  const r=inner.getBoundingClientRect();
  const wx=(e.clientX-r.left)/0.02, wy=(e.clientY-r.top)/0.02;
  boardPan={x: vp.clientWidth/2 - wx*boardScale, y: vp.clientHeight/2 - wy*boardScale};
  updateBoardTransform(); boardSave();
}
function boardExport(){
  const raw=localStorage.getItem('board-layout-v1')||'{"pan":{"x":0,"y":0},"scale":1,"cards":[]}';
  const blob=new Blob([raw],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='wikiboard-layout-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
  toast('Board layout exported');
}
function boardImportFile(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const j=JSON.parse(r.result);
      if(!Array.isArray(j.cards)) throw new Error('bad layout');
      boardClearNoConfirm();
      localStorage.setItem('board-layout-v1', JSON.stringify({pan:j.pan||{x:0,y:0}, scale:j.scale||1, cards:j.cards, links:j.links||[]}));
      boardLoad();
      toast('Board layout imported ✓');
    }catch{ toast('Invalid layout file', true); }
  };
  r.readAsText(f);
  e.target.value='';
}
function boardZoom(d){
  boardScale=Math.min(1.6, Math.max(0.5, boardScale+d));
  updateBoardTransform();
  boardSave();
}
function boardReset(){
  boardPan={x:0,y:0}; boardScale=1; updateBoardTransform(); boardSave();
}
function boardClear(){
  if(!confirm('Clear board?')) return;
  boardClearNoConfirm();
}
function boardClearNoConfirm(){
  document.querySelectorAll('.board-card').forEach(el=> el.remove());
  boardCards=[]; boardConnections=[]; document.getElementById('boardConnections').innerHTML=''; boardNextId=1; boardSave();
}
function boardLoadNeetCodeMap(force){
  if(!force && boardCards.length>0 && !confirm('Load NeetCode Map? This will replace board with 56 chapter roadmap.')) return;
  // force clear without confirm
  document.querySelectorAll('.board-card').forEach(el=> el.remove());
  boardCards=[]; boardConnections=[]; document.getElementById('boardConnections').innerHTML=''; boardNextId=1;
  // also reset pan/scale for map view
  boardPan={x:-20, y:-20}; boardScale=0.68; updateBoardTransform();
  // NeetCode-style roadmap layout: 12 phases as swimlanes, 56 chapters as nodes — compact for 56
  const cols=4, colW=360, rowH=860, startX=30, startY=30;
  let cardIds=[]; // keep id per chapter for connections
  PHASES.forEach((ph, pIdx)=>{
    const col=pIdx % cols, row=Math.floor(pIdx / cols);
    const baseX=startX + col*colW, baseY=startY + row*rowH;
    // Phase header card — compact
    const phaseCard=boardAddCard('phase', ph.name, baseX, baseY, 340, 48, false);
    phaseCard.el.querySelector('.card-header').innerHTML=`<span class="serif text-sm">${ph.name} <span class="hand text-[10px]">${ph.range[0]}–${ph.range[1]}</span></span><span class="hand text-[10px]">${ph.desc.split('•')[0].trim()}</span>`;
    phaseCard.el.style.background='#fef9c3'; phaseCard.el.style.border='1px solid #fde68a';
    // Chapters in this phase — compact nodes like NeetCode
    const chs=DATA.chapters.filter(c=> c.id>=ph.range[0] && c.id<=ph.range[1]);
    chs.forEach((ch, idx)=>{
      const x=baseX+8, y=baseY+58 + idx*78, w=340, h=70;
      const card=boardAddCard('chapter', ch.id, x, y, w, h, false);
      // compact chapter node: override body to mini roadmap node
      const prog=chapterProgress(ch);
      const pctColor=prog===100?'#10b981': prog>50?'#f59e0b':'#e7e5e4';
      card.el.querySelector('.p-3').innerHTML=`<div class="flex justify-between items-center"><span class="serif text-sm">${String(ch.id).padStart(2,'0')}. ${ch.title}</span><span class="chip hand text-[10px]">${prog}%</span></div><div class="w-full bg-stone-100 h-1.5 rounded-full border mt-1"><div class="h-1.5 rounded-full" style="width:${prog}%; background:${pctColor}"></div></div><div class="flex gap-0.5 mt-1">${ch.questions.slice(0,3).map(q=> `<span class="chip hand text-[9px]">${q.title.split(' ').slice(0,2).join(' ')}</span>`).join('')}<span class="hand text-[10px] text-stone-400">+${ch.questions.length-3}</span></div>`;
      cardIds.push(card.id);
      // connect phase header to first chapter
      if(idx===0) boardAddConnection(phaseCard.id, card.id);
      else {
        const prev=boardCards[boardCards.length-2];
        boardAddConnection(prev.id, card.id);
      }
    });
  });
  // Connect phases sequentially (roadmap flow)
  for(let i=0;i<PHASES.length-1;i++){
    const fromPhase=boardCards.find(c=> c.type==='phase' && c.key===PHASES[i].name);
    const toPhase=boardCards.find(c=> c.type==='phase' && c.key===PHASES[i+1].name);
    if(fromPhase && toPhase) boardAddConnection(fromPhase.id, toPhase.id);
  }
  boardPan={x:20, y:10}; boardScale=0.62; updateBoardTransform();
  boardSave();
  // legend in top-right corner of board
  boardAddCard('welcome', 1480, 30, 340, 180, false);
  const legend=boardCards[boardCards.length-1];
  legend.el.querySelector('.p-3').innerHTML=`<div class="hand text-xs space-y-1"><p class="serif text-sm">NeetCode Map • 56 ch • 12 phases</p><p>Follow left→right, top→bottom. Click chapter node → opens full Qs beside. Blue <span class="text-sky-700 underline">LC</span> pills → company cards.</p><p class="text-[11px] text-stone-500">Like wikiboard: each click opens card beside, drag to rearrange, lines show path.</p></div>`;
  boardSave();
}
function boardDrawConnections(){
  const svg=document.getElementById('boardConnections');
  if(svg){
    svg.innerHTML='';
    for(let i=0;i<boardConnections.length;i++){
      const conn=boardConnections[i];
      const from=boardCards.find(c=>c.id===conn.from);
      const to=boardCards.find(c=>c.id===conn.to);
      if(!from || !to) continue;
      const fx=from.x + from.w/2, fy=from.y + from.h/2;
      const tx=to.x + to.w/2, ty=to.y + to.h/2;
      const dx=Math.max(40, Math.abs(tx-fx)/2);
      const d=`M ${fx} ${fy} C ${fx+dx} ${fy}, ${tx-dx} ${ty}, ${tx} ${ty}`;
      const hit=document.createElementNS('http://www.w3.org/2000/svg','path');
      hit.setAttribute('d', d); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '14'); hit.setAttribute('fill', 'none');
      hit.setAttribute('style', 'pointer-events:stroke; cursor:pointer');
      hit.setAttribute('data-conn', i);
      hit.addEventListener('click', ev=>{ ev.stopPropagation(); boardDeleteConnection(i); });
      const line=document.createElementNS('http://www.w3.org/2000/svg','path');
      line.setAttribute('d', d); line.setAttribute('stroke', '#a8a29e'); line.setAttribute('stroke-width', '1.4'); line.setAttribute('fill', 'none'); line.setAttribute('stroke-dasharray','6 4'); line.setAttribute('opacity','0.65');
      line.setAttribute('style', 'pointer-events:none');
      svg.appendChild(hit); svg.appendChild(line);
    }
  boardRenderMini();
}
function boardDeleteConnection(i){
  boardConnections.splice(i,1);
  boardDrawConnections(); boardSave();
  toast('Link removed');
}
}
function boardAddConnection(fromId, toId){
  boardConnections.push({from:fromId, to:toId});
  boardDrawConnections(); boardSave();
}
function boardAddCard(type, key, x, y, w, h, doSave=true){
  // Clean single signature. Supported calls:
  //   boardAddCard('chapter', 1)                   -> auto-place beside last card
  //   boardAddCard('chapter', 1, x, y, w, h, save) -> explicit rect (restore + duplicate)
  //   boardAddCard('welcome', x, y, w, h, save)    -> rect travels in the key slot for solo cards
  const SOLO=(type==='welcome'||type==='stats'||type==='nextup');
  if(SOLO && typeof key==='number'){ doSave=(typeof h==='boolean'? h : true); h=w; w=y; y=x; x=key; key=type; }
  if(SOLO && (key===undefined||key===null)) key=type;
  const hasRect=[x,y,w,h].every(v=> typeof v==='number');
  if(!hasRect){
    const last=boardCards[boardCards.length-1];
    if(last){ x=last.x+last.w+24; y=last.y; } else { x=40; y=40; }
    w=360;
    h=(type==='chapter')?320:(type==='company'?420:(type==='phase'?120:260));
  }
  x=Math.max(0, Math.round(x)); y=Math.max(0, Math.round(y));
  w=Math.max(280, w); h=Math.max(160, h);
  // dedup: if card with same type+key already exists, focus it instead of duplicate
  const existing=boardCards.find(c=> c.type===type && String(c.key)===String(key));
  if(existing){
    existing.el.classList.add('selected'); setTimeout(()=> existing.el.classList.remove('selected'), 800);
    // bring into view by panning
    boardPan={x: -existing.x + 60, y: -existing.y + 60}; updateBoardTransform();
    return existing;
  }
  const id=boardNextId++;
  const el=document.createElement('div');
  el.className='board-card';
  el.style.left=x+'px'; el.style.top=y+'px'; el.style.width=w+'px'; el.style.height=h+'px';
  el.dataset.id=id;
  const header=document.createElement('div');
  header.className='card-header paper px-3 py-2 border-b flex justify-between items-center hand text-xs';
  const titleMap={welcome:'Welcome • Board ∞', stats:'Progress • Editorial Paper', nextup:'Next Up • Ink', chapter:'Chapter', company:'Company', question:'Question', phase:'Phase'};
  let title=titleMap[type]||type;
  if(type==='chapter'){ const ch=DATA.chapters.find(c=>c.id===Number(key)); title=ch? `Ch ${String(ch.id).padStart(2,'0')} • ${esc(ch.title)}` : `Chapter ${esc(key)}`; }
  if(type==='company'){ const meta=companiesMeta?.companies.find(c=>c.slug===key); title=`🏢 ${meta?meta.name:key} • ${meta?meta.counts.all+' Qs':''}`; }
  if(type==='question'){ const q=findQuestionByLC(key); title=q? `LC${q.lcId||''} ${q.title} • ${q.difficulty}` : `Q ${key}`; }
  if(type==='phase'){ const ph=PHASES.find(p=>p.name===key); title=ph? `${ph.name} [${ph.range[0]}–${ph.range[1]}] • ${ph.desc}` : key; }
  header.innerHTML=`<span class="serif text-sm truncate">${title}</span><span class="flex gap-1"><button onclick="boardDuplicateCard(${id})" class="chip hand text-[10px]">⧉</button><button onclick="boardCloseCard(${id})" class="chip hand text-[10px]">✕</button></span>`;
  el.appendChild(header);
  const body=document.createElement('div');
  body.className='p-3 overflow-auto hand text-xs';
  body.style.height='calc(100% - 36px)';
  // content per type
  if(type==='welcome'){
    body.innerHTML=`<div class="tape">Board ∞ — Wikiboard</div><div class="mt-4 space-y-2 hand text-sm leading-tight"><p><b>Drag</b> cards by header, <b>drag bg</b> to pan, <b>wheel</b> to zoom, <b>↘</b> to resize.</p><p>Click any <span class="text-sky-700 underline">blue link</span> (LC, Company pill) → opens card <i>beside</i> with line. No navigation loss.</p><div class="flex gap-1 flex-wrap"><button onclick="boardAddCard('chapter',1)" class="chip">+ Ch 01 Array</button><button onclick="boardAddCard('company','google')" class="chip">+ Google</button><button onclick="boardAddCard('question','1')" class="chip">+ Two Sum</button></div><p class="text-[11px] text-stone-500">Board auto-saves to <code>localStorage board-layout-v1</code>. Share not yet — export JSON.</p></div>`;
  } else if(type==='stats'){
    const allRows=DATA.chapters.reduce((a,c)=>a+c.questions.length,0);
    const uniqSet=new Set(DATA.chapters.flatMap(c=>c.questions.map(q=> q.leetcode? 'LC'+q.leetcode : c.id+'-'+q.id)));
    const uniqTotal=uniqSet.size;
    const uniqDone=new Set(); DATA.chapters.forEach(c=> c.questions.forEach(q=>{ if(getQStatus(c.id,q)==='done') uniqDone.add(q.leetcode? 'LC'+q.leetcode : c.id+'-'+q.id); }));
    const pct=uniqTotal? Math.round(uniqDone.size/uniqTotal*100):0;
    body.innerHTML=`<div class="space-y-2"><p class="serif text-lg">${pct}% inked • ${uniqDone.size}/${uniqTotal} unique</p><div class="w-full bg-stone-100 h-2 rounded-full border"><div class="bg-stone-900 h-2 rounded-full" style="width:${pct}%"></div></div><p class="hand text-xs">${DATA.chapters.filter(isChapterDone).length}/56 chapters done</p><button onclick="setView('chapters'); window.scrollTo({top:0,behavior:'smooth'})" class="chip">Go to Chapters →</button></div>`;
  } else if(type==='nextup'){
    const nu=nextUpChapter();
    if(nu){
      body.innerHTML=`<p class="serif text-sm">${esc(nu.q.title)} — ${esc(nu.ch.title)}</p><p class="hand text-xs">${nu.q.difficulty||''} • LC${nu.q.leetcode||nu.q.lcId||''}</p><div class="flex gap-1 mt-2"><a target="_blank" href="${lcUrl(nu.q)}" class="chip bg-sky-50">Open LC ↗</a><button onclick="boardAddCard('question','${nu.q.leetcode||nu.q.lcId||''}')" class="chip">+ Card</button></div>`;
    } else body.innerHTML=`<p class="hand text-sm">All caught up — pick Revise ★</p>`;
  } else if(type==='chapter'){
    const ch=DATA.chapters.find(c=>c.id===Number(key));
    if(!ch){ body.innerHTML='Not found'; } else {
      const prog=chapterProgress(ch);
      body.innerHTML=`<p class="hand text-[11px] text-stone-500">${ch.filename}</p><p class="serif text-sm">${ch.title} • ${prog}%</p><div class="w-full bg-stone-100 h-1.5 rounded-full border mt-1"><div class="bg-stone-900 h-1.5 rounded-full" style="width:${prog}%"></div></div><div class="mt-2 space-y-1 max-h-[180px] overflow-auto">${ch.questions.slice(0,8).map(q=> `<div class="flex justify-between items-center border rounded-full px-2 py-1 bg-white"><span class="hand text-xs truncate">${q.title} <span class="mono text-[10px]">LC${q.leetcode||''}</span></span><button onclick="boardAddCard('question','${q.leetcode||q.id}'); boardAddConnection(${id}, boardCards[boardCards.length-1]?.id||0)" class="chip hand text-[10px]">+ Card</button></div>`).join('')}${ch.questions.length>8?`<p class="hand text-[10px] text-stone-400">+${ch.questions.length-8} more — open full chapter</p>`:''}</div><button onclick="activeChapter=${ch.id}; view='chapters'; updateViewBtns(); render(); window.scrollTo({top:0,behavior:'smooth'})" class="chip mt-2">Open chapter view →</button>`;
    }
  } else if(type==='company'){
    const slug=String(key);
    const meta=companiesMeta?.companies.find(c=>c.slug===slug);
    const counts=meta? meta.counts : {all:'?', '30d':'?'};
    body.innerHTML=`<p class="hand text-xs">All: ${counts.all} • 30d: ${counts['30d']} • 3m: ${counts['3m']||''}</p><div class="flex gap-1 mt-1"><button onclick="selectedCompany='${slug}'; view='companies'; updateViewBtns(); loadCompanyData();" class="chip">Open Companies →</button><button onclick="boardAddCard('question','1')" class="chip">+ Two Sum</button></div><div class="mt-2 text-[11px] hand text-stone-500">Tip: click Company pill in any QuestionCard → new card beside.</div>`;
    // async load top Qs
    if(companiesMeta){
      fetch('/api/company/'+encodeURIComponent(slug)+'?timeframe=30d&limit=5').then(r=>r.json()).then(j=>{
        const qs=j.questions||[];
        body.innerHTML+=`<div class="mt-2 space-y-1">${qs.map(q=> `<div class="flex justify-between border rounded-full px-2 py-1 bg-white"><span class="hand text-xs truncate">${q.title} <span class="mono text-[10px]">${q.frequency.toFixed(1)}</span></span><button onclick="boardAddCard('question','${q.lcId}')" class="chip hand text-[10px]">+ Card</button></div>`).join('')}</div>`;
      });
    }
  } else if(type==='question'){
    const q=findQuestionByLC(String(key));
    if(!q){ body.innerHTML=`<p>LC${key} not in DSA 56ch — maybe company-only. Try <a target="_blank" href="https://leetcode.com/problems/${key}/" class="text-sky-700 underline">LC ${key}</a></p>`; }
    else {
      const ch=DATA.chapters.find(c=> c.questions.some(x=> String(x.leetcode)===String(q.lcId||q.leetcode)));
      const s=getQStatus(ch?ch.id:1, q);
      const pills=getCompanyTagsForLC(q.lcId||q.leetcode).map(c=> `<button onclick="boardAddCard('company','${c.slug}'); boardAddConnection(${id}, boardCards[boardCards.length-1]?.id||0)" class="chip hand text-[10px] bg-sky-50">${c.company} ${c.frequency.toFixed(0)}</button>`).join('');
      body.innerHTML=`<p class="serif text-sm">${esc(q.title)}</p><p class="hand text-xs">${q.difficulty} • LC${q.lcId||q.leetcode} • ${ch? 'Ch '+String(ch.id).padStart(2,'0'):''}</p><div class="flex gap-1 mt-1"><select onchange="progress.questions['LC${q.lcId||q.leetcode}']=this.value; progress._time['LC${q.lcId||q.leetcode}']=Date.now(); save(); renderStats(); boardDrawConnections();" class="hand text-xs border rounded-full px-2 py-0.5"><option ${s==='todo'?'selected':''} value="todo">✗ Todo</option><option ${s==='done'?'selected':''} value="done">✓ Done</option><option ${s==='revise'?'selected':''} value="revise">★ Revise</option></select><a target="_blank" href="${lcUrl(q)}" class="chip bg-sky-50">LC ↗</a></div><div class="flex flex-wrap gap-0.5 mt-2">${pills||'<span class="hand text-[10px] text-stone-400">No company tag</span>'}</div><input placeholder="pen notes" value="${(progress.notes['LC'+(q.lcId||q.leetcode)]||'').replace(/"/g,'&quot;')}" oninput="progress.notes['LC${q.lcId||q.leetcode}']=this.value; save();" class="w-full hand text-xs border border-dashed rounded-full px-2 py-1 mt-2 bg-amber-50/30">`;
    }
  } else if(type==='phase'){
    const ph=PHASES.find(p=>p.name===String(key));
    if(!ph){ body.innerHTML=`<p>${key}</p>`; }
    else {
      const chs=DATA.chapters.filter(c=> c.id>=ph.range[0] && c.id<=ph.range[1]);
      const avg=Math.round(chs.reduce((a,c)=>a+chapterProgress(c),0)/ (chs.length||1));
      body.innerHTML=`<p class="hand text-xs">${ph.desc}</p><div class="w-full bg-stone-100 h-1.5 rounded-full border mt-1"><div class="bg-stone-900 h-1.5 rounded-full" style="width:${avg}%"></div></div><p class="hand text-[10px]">${chs.filter(isChapterDone).length}/${chs.length} ch done • ${avg}%</p><div class="flex flex-wrap gap-0.5 mt-1">${chs.map(ch=> `<button onclick="boardAddCard('chapter',${ch.id})" class="chip hand text-[10px] ${isChapterDone(ch)?'bg-emerald-100':''}">${String(ch.id).padStart(2,'0')} ${ch.title.split(' ').slice(0,2).join(' ')}</button>`).join('')}</div>`;
    }
  }
  el.appendChild(body);
  const handle=document.createElement('div');
  handle.className='resize-handle'; handle.innerHTML='<i class="fa-solid fa-up-right-and-down-left-from-center text-[10px]"></i>';
  el.appendChild(handle);
  document.getElementById('board').appendChild(el);
  boardCards.push({id, type, key:String(key), x, y, w, h, el});
  makeCardDraggable(el, id);
  makeCardResizable(el, id);
  if(!boardLoading && boardCards.length>1){
    const prev=boardCards[boardCards.length-2];
    boardAddConnection(prev.id, id);
  }
  if(doSave) boardSave();
  return boardCards[boardCards.length-1];
}
function findQuestionByLC(lc){
  const s=String(lc).replace(/^LC/,'');
  for(const ch of DATA.chapters){ for(const q of ch.questions){ if(String(q.leetcode)===s) return {...q, lcId:q.leetcode}; } }
  // fallback check companies? try company_index
  if(companyIndexCache && companyIndexCache['LC'+s]) return {lcId:s, title:'LC'+s, difficulty:'Medium', slug:'', leetcode: Number(s)};
  return null;
}
function makeCardDraggable(el, id){
  const header=el.querySelector('.card-header');
  let startX, startY, origX, origY;
  header.addEventListener('pointerdown', e=>{
    if(e.target.closest('button')) return;
    e.preventDefault();
    const card=boardCards.find(c=>c.id===id);
    if(!card) return;
    boardDragging=card;
    startX=e.clientX; startY=e.clientY; origX=card.x; origY=card.y;
    el.classList.add('selected');
    try{ header.setPointerCapture(e.pointerId); }catch{}
  });
  header.addEventListener('pointermove', e=>{
    if(!boardDragging || boardDragging.id!==id) return;
    const dx=(e.clientX - startX)/boardScale;
    const dy=(e.clientY - startY)/boardScale;
    boardDragging.x=origX+dx; boardDragging.y=origY+dy;
    boardDragging.el.style.left=boardDragging.x+'px';
    boardDragging.el.style.top=boardDragging.y+'px';
    boardDrawConnections();
  });
  function stopDrag(){
    if(boardDragging && boardDragging.id===id){ boardSave(); boardDragging=null; }
    setTimeout(()=> el.classList.remove('selected'), 400);
  }
  header.addEventListener('pointerup', stopDrag);
  header.addEventListener('pointercancel', stopDrag);
}
function makeCardResizable(el, id){
  const handle=el.querySelector('.resize-handle');
  let startX, startY, startW, startH;
  handle.addEventListener('pointerdown', e=>{
    e.preventDefault(); e.stopPropagation();
    const card=boardCards.find(c=>c.id===id);
    if(!card) return;
    boardResizing=card;
    startX=e.clientX; startY=e.clientY; startW=card.w; startH=card.h;
    try{ handle.setPointerCapture(e.pointerId); }catch{}
  });
  handle.addEventListener('pointermove', e=>{
    if(!boardResizing || boardResizing.id!==id) return;
    const card=boardResizing;
    const dw=(e.clientX - startX)/boardScale;
    const dh=(e.clientY - startY)/boardScale;
    card.w=Math.max(280, startW+dw); card.h=Math.max(160, startH+dh);
    card.el.style.width=card.w+'px'; card.el.style.height=card.h+'px';
    boardDrawConnections();
  });
  function stopRes(){
    if(boardResizing && boardResizing.id===id){ boardResizing=null; boardSave(); }
  }
  handle.addEventListener('pointerup', stopRes);
  handle.addEventListener('pointercancel', stopRes);
}
function boardCloseCard(id){
  const idx=boardCards.findIndex(c=>c.id===id);
  if(idx>=0){ boardCards[idx].el.remove(); boardCards.splice(idx,1); boardConnections=boardConnections.filter(c=> c.from!==id && c.to!==id); boardDrawConnections(); boardSave(); }
}
function boardDuplicateCard(id){
  const c=boardCards.find(x=>x.id===id);
  if(c) boardAddCard(c.type, c.key, c.x+24, c.y+24, c.w, c.h);
}
// board pan/zoom
(function initBoardPanZoom(){
  const vp=document.getElementById('boardViewport');
  if(!vp) return;
  vp.addEventListener('pointerdown', e=>{
    if(e.target!==vp && e.target.id!=='board' && e.target.id!=='boardConnections') return;
    boardPanning=true; boardPanStart={x:e.clientX - boardPan.x, y:e.clientY - boardPan.y};
    vp.style.cursor='grabbing';
    try{ vp.setPointerCapture(e.pointerId); }catch{}
  });
  vp.addEventListener('pointermove', e=>{
    if(!boardPanning) return;
    boardPan.x=e.clientX - boardPanStart.x;
    boardPan.y=e.clientY - boardPanStart.y;
    updateBoardTransform();
  });
  function stopPan(){ if(boardPanning){ boardPanning=false; document.getElementById('boardViewport').style.cursor='grab'; boardSave(); } }
  vp.addEventListener('pointerup', stopPan);
  vp.addEventListener('pointercancel', stopPan);
  vp.addEventListener('wheel', e=>{
    e.preventDefault();
    const d=e.deltaY>0?-0.08:0.08;
    boardZoom(d);
  }, {passive:false});
})();
