function render(){
  if(!DATA) return;
  if(view==='board'){
    renderStats(); updateViewBtns();
    return;
  }
  renderStats(); updateViewBtns();
  const main=document.getElementById('mainContent');
  const diffFilter=document.getElementById('filterDiff').value;
  const statusFilter=document.getElementById('filterStatus').value;

  if(view==='companies'){
    if(!companiesMeta){
      main.innerHTML=`<div class="paper rounded-2xl p-6 space-y-2"><div class="skeleton h-4 w-1/3"></div><div class="skeleton h-4 w-full"></div><div class="skeleton h-4 w-5/6"></div><div class="skeleton h-4 w-2/3"></div><p class="hand text-xs text-stone-400 pt-1">Loading companies…</p></div>`;
      return;
    }
    if(!companyData || companyLoading){
      main.innerHTML=`<div class="paper rounded-2xl p-6 space-y-2"><div class="skeleton h-4 w-1/4"></div><div class="skeleton h-4 w-full"></div><div class="skeleton h-4 w-4/6"></div><p class="hand text-xs text-stone-400 pt-1">Loading ${esc(selectedCompany)} • ${esc(selectedTimeframe)}…</p></div>`;
      if(!companyLoading) loadCompanyData();
      return;
    }
    const total=companyData.total;
    const qs=companyData.questions||[];
    const maxPage=Math.ceil(total/companyLimit)||1;
    const start=(companyPage-1)*companyLimit+1;
    const end=Math.min(total, companyPage*companyLimit);
    // dedup helper for status: already injected via API if auth, else local
    function companyGetStatus(q){
      if(q.status) return q.status;
      const k=q.lcId ? 'LC'+q.lcId : 'SLUG:'+q.slug;
      if(q.lcId && progress.questions['LC'+q.lcId]) return progress.questions['LC'+q.lcId];
      return progress.questions[k]||'todo';
    }
    main.innerHTML=`
      <div class="paper rounded-2xl overflow-hidden">
        <div class="tape">Companies • ${companyData.company} • ${companyData.timeframe} • ${total} Qs • ${companiesMeta.totalCompanies} companies</div>
        <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="ml-0 lg:ml-10 mt-8 p-3 space-y-3">
          ${(progress.companyPrefs.target && progress.companyPrefs.target===selectedCompany)?(()=>{
            const dpg=qs.filter(q=> companyGetStatus(q)==='done').length;
            return `<div class="flex flex-wrap items-center gap-2 hand text-xs bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5"><span>★ Target: <b>${esc(companyData.company)}</b> • ${dpg}/${qs.length} done on this page</span><button onclick="markCompanyPageDone()" class="chip hand text-[11px] bg-stone-900 text-white">Mark page done</button></div>`;
          })():''}
          <!-- Timeframe tabs -->
          <div class="flex flex-wrap gap-1">
            ${['30d','3m','6m','gt6m','all'].map(tf=>{
              const active=selectedTimeframe===tf;
              const label={ '30d':'30 Days','3m':'3 Months','6m':'6 Months','gt6m':'>6 Months','all':'All Time'}[tf];
              const count=companyData.counts[tf]||0;
              return `<button onclick="onCompanyTimeframe('${tf}')" class="chip hand text-xs ${active?'active bg-stone-900 text-white border-stone-900':'bg-white'}">${label} <span class="opacity-60">${count}</span></button>`;
            }).join('')}
            <span class="hand text-[11px] text-stone-500 ml-2">Sorted by frequency • Target for Next Up</span>
          </div>
          <!-- Stats strip -->
          ${(()=>{
            const doneOnPage=qs.filter(q=> companyGetStatus(q)==='done').length;
            const pctPage=qs.length? Math.round(doneOnPage/qs.length*100):0;
            const diffE=qs.filter(q=>q.difficulty==='Easy').length;
            const diffM=qs.filter(q=>q.difficulty==='Medium').length;
            const diffH=qs.filter(q=>q.difficulty==='Hard').length;
            const overlap=qs.filter(q=> q.lcId && DATA.chapters.some(c=> c.questions.some(x=>x.leetcode===q.lcId))).length;
            return `<div class="grid grid-cols-3 gap-2">
              <div class="paper rounded-xl p-2 border text-center">
                <p class="hand text-[10px] tracking-widest text-stone-500">PAGE PROGRESS</p>
                <p class="serif text-lg">${doneOnPage}/${qs.length} <span class="hand text-xs">(${pctPage}%)</span></p>
                <div class="w-full bg-stone-100 h-1.5 rounded-full border mt-1"><div class="bg-stone-900 h-1.5 rounded-full" style="width:${pctPage}%"></div></div>
                <p class="hand text-[10px] text-stone-400 mt-1">${total} total in ${companyData.timeframe}</p>
              </div>
              <div class="paper rounded-xl p-2 border text-center">
                <p class="hand text-[10px] tracking-widest text-stone-500">DIFFICULTY ON PAGE</p>
                <div class="flex gap-1 justify-center mt-1">
                  <span class="chip hand text-[10px] bg-emerald-50">E ${diffE}</span>
                  <span class="chip hand text-[10px] bg-amber-50">M ${diffM}</span>
                  <span class="chip hand text-[10px] bg-red-50">H ${diffH}</span>
                </div>
                <div class="w-full bg-stone-100 h-1.5 rounded-full mt-2 flex overflow-hidden border">
                  <div class="bg-emerald-500 h-1.5" style="width:${qs.length?diffE/qs.length*100:0}%"></div>
                  <div class="bg-amber-500 h-1.5" style="width:${qs.length?diffM/qs.length*100:0}%"></div>
                  <div class="bg-red-500 h-1.5" style="width:${qs.length?diffH/qs.length*100:0}%"></div>
                </div>
              </div>
              <div class="paper rounded-xl p-2 border text-center">
                <p class="hand text-[10px] tracking-widest text-stone-500">DSA OVERLAP</p>
                <p class="serif text-lg">${overlap}/${qs.length}</p>
                <p class="hand text-[10px] text-stone-400">in 56ch • ${total-overlap? 'rest external':''}</p>
                <p class="hand text-[10px] text-sky-700 underline">${overlap? 'click pill → chapter':''}</p>
              </div>
            </div>`;
          })()}
          <!-- Filters -->
          <div class="flex flex-wrap gap-1 items-center">
            <div class="relative flex-1 min-w-[160px] max-w-[260px]">
              <i class="fa-solid fa-search absolute left-2.5 top-2.5 text-stone-400 text-[11px]"></i>
              <input id="companySearchInput" value="${companySearch.replace(/"/g,'&quot;')}" oninput="onCompanySearch(this.value)" placeholder="Filter ${companyData.company} Qs…" class="w-full pl-7 pr-2 py-1.5 text-xs border border-stone-300 rounded-full bg-amber-50/40 hand focus:bg-white focus:outline-none">
            </div>
            <select id="companyDiff" onchange="companyDiffFilter=this.value; companyPage=1; loadCompanyData()" class="chip hand text-xs">
              <option value="" ${!companyDiffFilter?'selected':''}>All levels</option>
              <option value="Easy" ${companyDiffFilter==='Easy'?'selected':''}>Easy</option>
              <option value="Medium" ${companyDiffFilter==='Medium'?'selected':''}>Medium</option>
              <option value="Hard" ${companyDiffFilter==='Hard'?'selected':''}>Hard</option>
            </select>
            <select id="companySort" onchange="onCompanySort(this.value)" class="chip hand text-xs">
              <option value="frequency" ${companySort==='frequency'?'selected':''}>Freq ↓</option>
              <option value="title" ${companySort==='title'?'selected':''}>Title A-Z</option>
              <option value="difficulty" ${companySort==='difficulty'?'selected':''}>Difficulty</option>
            </select>
            <label class="chip hand text-xs flex items-center gap-1">Freq ≥ <span id="freqVal">${companyMinFreq}</span> <input type="range" min="0" max="100" step="10" value="${companyMinFreq}" oninput="onCompanyMinFreq(this.value)" class="range w-16"></label>
            <button onclick="loadCompanyData()" class="chip hand text-xs"><i class="fa-solid fa-rotate"></i> Refresh</button>
            <span class="hand text-xs">${total} Qs • ${qs.filter(q=> companyGetStatus(q)==='done').length} done on page</span>
          </div>
          <!-- Table desktop -->
          <div class="hidden md:block overflow-x-auto border border-stone-200 rounded-xl">
            <table class="w-full text-sm">
              <thead class="bg-stone-900 text-amber-50 hand text-xs"><tr><th class="px-2 py-2 text-left">Status</th><th class="px-2 py-2">LC</th><th class="px-2 py-2 text-left">Title</th><th class="px-2 py-2">Freq</th><th class="px-2 py-2">Level</th><th class="px-2 py-2 text-left">Topics</th><th class="px-2 py-2 text-left">DSA</th><th class="px-2 py-2 text-left">Pen</th><th></th></tr></thead>
              <tbody>${qs.map(q=>{
                const s=companyGetStatus(q);
                const cls=s==='done'?'q-done':s==='revise'?'q-revise':'';
                const key=q.lcId ? 'LC'+q.lcId : 'SLUG:'+q.slug;
                const note=progress.notes[key]||'';
                // DSA chapter lookup: find which chapter has this lcId
                let dsaChips='';
                let dsaId=null;
                if(q.lcId){
                  for(const c of DATA.chapters){ if(c.questions.some(x=> x.leetcode===q.lcId)){ dsaId=c.id; dsaChips=`<button onclick="activeChapter=${c.id}; view='chapters'; updateViewBtns(); render(); window.scrollTo({top:0,behavior:'smooth'})" class="chip hand text-[10px] bg-sky-50 border-sky-200 hover:bg-sky-100">${String(c.id).padStart(2,'0')}.${c.title.slice(0,12)}</button>`; break; } }
                  if(!dsaChips) dsaChips='<span class="hand text-[10px] text-stone-400">External</span>';
                } else dsaChips='<span class="hand text-[10px] text-stone-400">—</span>';
                const freqColor=q.frequency>=80?'bg-red-100 border-red-300':q.frequency>=60?'bg-amber-100 border-amber-300':q.frequency>=40?'bg-emerald-50': 'bg-white';
                const barColor=q.frequency>=80?'bg-red-500':q.frequency>=60?'bg-amber-500':'bg-emerald-500';
                return `<tr class="border-t ${cls} hover:bg-amber-50/30">
                  <td class="px-2 py-1"><select onchange="setCompanyQStatus(${q.lcId||'null'}, '${q.slug}', this.value)" class="hand text-xs border rounded-full px-2 py-0.5 ${s==='done'?'bg-emerald-100':s==='revise'?'bg-amber-100':''}"><option ${s==='todo'?'selected':''} value="todo">✗ Todo</option><option ${s==='done'?'selected':''} value="done">✓ Done</option><option ${s==='revise'?'selected':''} value="revise">★ Revise</option></select></td>
                  <td class="px-2 py-1 mono text-xs text-center">${q.lcId?`<a target="_blank" href="${lcUrl(q)}" class="text-sky-700 underline decoration-dotted">${q.lcId}</a>`:'—'}</td>
                  <td class="px-2 py-1 hand text-sm">${esc(q.title)}<div class="w-full bg-stone-100 h-1 rounded-full mt-1 border"><div class="h-1 rounded-full ${barColor}" style="width:${q.frequency}%"></div></div></td>
                  <td class="px-2 py-1 text-center"><span class="chip hand text-[10px] ${freqColor}">${q.frequency.toFixed(1)}</span></td>
                  <td class="px-2 py-1 text-center"><span class="chip hand text-[10px] ${q.difficulty==='Easy'?'bg-emerald-50':q.difficulty==='Hard'?'bg-red-50':'bg-amber-50'}">${q.difficulty}</span></td>
                  <td class="px-2 py-1 hand text-[11px]">${(q.topics||[]).slice(0,2).join(', ')}</td>
                  <td class="px-2 py-1">${dsaChips}</td>
                  <td class="px-2 py-1"><input value="${note.replace(/"/g,'&quot;')}" oninput="progress.notes['${key}']=this.value; save();" placeholder="ink…" class="w-full hand text-xs border border-dashed rounded-full px-2 py-1 bg-amber-50/30"></td>
                  <td class="px-2"><a target="_blank" href="${lcUrl(q)}"><i class="fa-solid fa-arrow-up-right-from-square text-[11px] text-stone-400"></i></a></td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <!-- Cards mobile -->
          <div class="md:hidden space-y-2">
            ${qs.slice(0,50).map(q=>{
              const s=companyGetStatus(q);
              return `<div class="paper rounded-xl p-3 flex gap-2 ${s==='done'?'q-done':s==='revise'?'q-revise':''}">
                <span class="check ${s==='done'?'done':''}" onclick="setCompanyQStatus(${q.lcId||'null'},'${q.slug}','${s==='done'?'todo':'done'}')">${s==='done'?'✓':''}</span>
                <div class="flex-1 min-w-0"><div class="hand text-sm">${q.title} <span class="mono text-[11px]">LC${q.lcId||'—'}</span> <span class="chip text-[10px]">${q.frequency.toFixed(1)}</span></div><div class="hand text-[11px] text-stone-500">${q.difficulty} • ${(q.topics||[]).slice(0,2).join(', ')}</div></div>
                <select onchange="setCompanyQStatus(${q.lcId||'null'},'${q.slug}',this.value)" class="hand text-xs border rounded-full px-1"><option ${s==='todo'?'selected':''} value="todo">✗</option><option ${s==='done'?'selected':''} value="done">✓</option><option ${s==='revise'?'selected':''} value="revise">★</option></select>
              </div>`;
            }).join('')}
          </div>
          <!-- Pagination -->
          <div class="flex justify-between items-center hand text-xs">
            <button onclick="changeCompanyPage(-1)" class="chip ${companyPage<=1?'opacity-40':''}" ${companyPage<=1?'disabled':''}>← Prev</button>
            <span>${start}-${end} of ${total} • page ${companyPage}/${maxPage}</span>
            <button onclick="changeCompanyPage(1)" class="chip ${companyPage>=maxPage?'opacity-40':''}" ${companyPage>=maxPage?'disabled':''}>Next →</button>
          </div>
          <p class="hand text-[11px] text-stone-400">Data: <a href="https://github.com/liquidslr/leetcode-company-wise-problems" target="_blank" class="underline">liquidslr</a> • Updated ${companyData.updated} • 30d = past 30 days, All = all time. Frequency is relative 0-100.</p>
        </div>
      </div>`;
    return;
  }

  if(view==='sprint'){ renderSprint(); return; }
  if(view==='due'){
    const items=dueItems();
    const today=srsToday();
    main.innerHTML=`
      <div class="paper rounded-2xl overflow-hidden">
        <div class="tape">Due today • ${items.length}</div>
        <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="ml-0 lg:ml-10 mt-8 p-3">
          <div class="flex flex-wrap gap-1 justify-between items-center mb-2">
            <span class="hand text-xs text-stone-500">Grade each card to reschedule • Again keeps it here</span>
            <span class="flex gap-1 items-center">
              <span class="hand text-xs">${items.length} due</span>
              ${items.length?`<button onclick="exportAnki()" title="Export due cards as Anki TSV" class="chip hand text-xs">Anki ⬇</button>`:''}
            </span>
          </div>
          ${items.length?`
          <div class="hidden md:block overflow-x-auto border border-stone-200 rounded-xl">
            <table class="w-full text-sm">
              <thead class="bg-stone-900 text-amber-50 hand text-xs"><tr><th class="px-2 py-2 text-left">Due</th><th class="px-2 py-2 text-left">Title</th><th class="px-2 py-2">Level</th><th class="px-2 py-2 text-left">Grade</th><th class="px-2 py-2 text-left">Status</th><th></th></tr></thead>
              <tbody>${items.map(it=>{
                const s=progress.questions[it.key]||'todo';
                const cls=s==='done'?'q-done':s==='revise'?'q-revise':'';
                const pv=g=>{ const iv=nextInterval(it.key,g); return iv===0?'today':iv+'d'; };
                const chArg=(it.chId!=null && it.lcOrId!=null)?`${it.chId},'${String(it.lcOrId).replace(/'/g,"\\'")}'`:`null,null`;
                return `<tr class="border-t ${cls} hover:bg-amber-50/40">
                  <td class="px-2 py-1 hand text-xs whitespace-nowrap">${dueLabel(it,today)}</td>
                  <td class="px-2 py-1 hand text-sm">${esc(it.title||it.key)}<div class="hand text-[11px] text-stone-500">${esc(it.sub||'')}</div></td>
                  <td class="px-2 py-1 text-center"><span class="chip hand text-[10px] ${it.difficulty==='Easy'?'bg-emerald-50':it.difficulty==='Hard'?'bg-red-50':'bg-amber-50'}">${esc(it.difficulty||'—')}</span></td>
                  <td class="px-2 py-1"><div class="flex gap-0.5 flex-wrap">
                    <button onclick="gradeQ('${it.key}','again')" title="Again → today" class="chip hand text-[10px] bg-red-50">Again</button>
                    <button onclick="gradeQ('${it.key}','hard')" title="Hard → ${pv('hard')}" class="chip hand text-[10px] bg-amber-50">Hard</button>
                    <button onclick="gradeQ('${it.key}','good')" title="Good → ${pv('good')}" class="chip hand text-[10px] bg-emerald-50">Good</button>
                    <button onclick="gradeQ('${it.key}','easy')" title="Easy → ${pv('easy')}" class="chip hand text-[10px] bg-sky-50">Easy</button>
                  </div></td>
                  <td class="px-2 py-1"><select onchange="setDueStatus('${it.key}', this.value, ${chArg})" class="hand text-xs border rounded-full px-2 py-0.5"><option ${s==='todo'?'selected':''} value="todo">✗ Todo</option><option ${s==='done'?'selected':''} value="done">✓ Done</option><option ${s==='revise'?'selected':''} value="revise">★ Revise</option></select></td>
                  <td class="px-2">${it.url?`<a target="_blank" href="${it.url}"><i class="fa-solid fa-arrow-up-right-from-square text-[11px] text-stone-400"></i></a>`:''}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2">
            ${items.map(it=>{
              const s=progress.questions[it.key]||'todo';
              const chArg=(it.chId!=null && it.lcOrId!=null)?`${it.chId},'${String(it.lcOrId).replace(/'/g,"\\'")}'`:`null,null`;
              return `<div class="paper rounded-xl p-3 ${s==='done'?'q-done':s==='revise'?'q-revise':''}">
                <div class="hand text-sm">${esc(it.title||it.key)}</div>
                <div class="hand text-[11px] text-stone-500">${esc(it.sub||'')} • ${dueLabel(it,today)}</div>
                <div class="flex gap-0.5 flex-wrap mt-1.5">
                  <button onclick="gradeQ('${it.key}','again')" class="chip hand text-[10px] bg-red-50">Again</button>
                  <button onclick="gradeQ('${it.key}','hard')" class="chip hand text-[10px] bg-amber-50">Hard</button>
                  <button onclick="gradeQ('${it.key}','good')" class="chip hand text-[10px] bg-emerald-50">Good</button>
                  <button onclick="gradeQ('${it.key}','easy')" class="chip hand text-[10px] bg-sky-50">Easy</button>
                  <select onchange="setDueStatus('${it.key}', this.value, ${chArg})" class="hand text-[11px] border rounded-full px-1 py-0.5"><option ${s==='todo'?'selected':''} value="todo">✗</option><option ${s==='done'?'selected':''} value="done">✓</option><option ${s==='revise'?'selected':''} value="revise">★</option></select>
                </div>
              </div>`;
            }).join('')}
          </div>`:`
          <div class="text-center p-8 hand mt-2">
            <p class="serif text-xl">All caught up — nothing due 🎉</p>
            <p class="hand text-sm text-stone-500 mt-1">Star tricky questions with <span class="kbd">R</span> or grade cards in Revise to build the schedule.</p>
            <button onclick="setView('revise')" class="mt-3 bg-stone-900 text-amber-100 serif px-4 py-1.5 rounded-full text-sm">Open Revise ★</button>
          </div>`}
        </div>
      </div>`;
    return;
  }

  if(view==='all' || view==='revise'){
    let all=[];
    DATA.chapters.forEach(ch=> ch.questions.forEach(q=> all.push({ch,q})));
    if(view==='revise') all=all.filter(x=> getQStatus(x.ch.id,x.q)==='revise');
    if(searchQ) all=all.filter(x=> (x.q.title+' '+x.ch.title).toLowerCase().includes(searchQ.toLowerCase()));
    if(diffFilter) all=all.filter(x=> x.q.difficulty===diffFilter);
    if(statusFilter) all=all.filter(x=> getQStatus(x.ch.id,x.q)===statusFilter);
    let isUnique=document.getElementById('dedupToggle')?.checked;
    if(isUnique){
      const map=new Map();
      all.forEach(({ch,q})=>{ const k=q.leetcode? 'LC'+q.leetcode : ch.id+'-'+q.id; if(!map.has(k)) map.set(k,{q, chs:[ch], first:ch}); else map.get(k).chs.push(ch); });
      all=Array.from(map.values()).map(v=>({ch:v.first, q:v.q, chs:v.chs}));
    }
    const order={todo:0, revise:1, done:2};
    all.sort((a,b)=> order[getQStatus(a.ch.id,a.q)] - order[getQStatus(b.ch.id,b.q)]);
    if(!all.length){
      const isRev=view==='revise';
      main.innerHTML=`<div class="paper rounded-2xl overflow-hidden"><div class="tape">${isRev?'★ Revise queue':'Unique Questions'}</div><div class="text-center p-8 hand mt-4"><p class="serif text-xl">${isRev?'Nothing to revise — yet.':'No questions match those filters.'}</p><p class="hand text-sm text-stone-500 mt-1">${isRev?'Star tricky questions with <span class="kbd">R</span> and they will queue up here.':'Try widening the search or clearing the filters.'}</p><div class="flex gap-1 justify-center mt-3">${isRev?`<button onclick="setView('chapters')" class="bg-stone-900 text-amber-100 serif px-4 py-1.5 rounded-full text-sm">Back to Chapters →</button>`:`<button onclick="clearFilters()" class="bg-stone-900 text-amber-100 serif px-4 py-1.5 rounded-full text-sm">Clear filters</button>`}</div></div></div>`;
      return;
    }
    // mobile cards vs table
    main.innerHTML=`
      <div class="paper rounded-2xl overflow-hidden">
        <div class="tape">${view==='revise'?'★ Revise':'Unique Questions'} • ${all.length} ${isUnique?`unique of ${DATA.chapters.reduce((a,c)=>a+c.questions.length,0)} rows`:''}</div>
        <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="ml-0 lg:ml-10 mt-8 p-3">
          <div class="flex flex-wrap gap-1 justify-between items-center mb-2">
            <span class="hand text-xs text-stone-500">Tap status to ink • LC to solve • notes auto-save</span>
            <span class="hand text-xs">${all.filter(x=>getQStatus(x.ch.id,x.q)==='done').length} done</span>
            <button onclick="exportAnki()" title="Export due + revise cards as Anki TSV" class="chip hand text-xs">Anki ⬇</button>
          </div>
          <!-- Table desktop -->
          <div class="hidden md:block overflow-x-auto border border-stone-200 rounded-xl">
            <table class="w-full text-sm">
              <thead class="bg-stone-900 text-amber-50 hand text-xs"><tr><th class="px-2 py-2 text-left">Status</th><th class="px-2 py-2">LC</th><th class="px-2 py-2 text-left">Title</th><th class="px-2 py-2 text-left">Chapters</th><th class="px-2 py-2">Level</th><th class="px-2 py-2 text-left">Pen notes</th><th></th></tr></thead>
              <tbody>${all.map(({ch,q,chs})=>{
                const s=getQStatus(ch.id,q); const key=qKey(q,ch.id); const note=progress.notes[key]||''; const cls=s==='done'?'q-done':s==='revise'?'q-revise':'';
                const chList=(chs||[ch]).map(c=> String(c.id).padStart(2,'0')).join(', ');
                return `<tr class="border-t ${cls} hover:bg-amber-50/40">
                  <td class="px-2 py-1"><select onchange="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), this.value)" class="hand text-xs border rounded-full px-2 py-0.5 ${s==='done'?'bg-emerald-100':s==='revise'?'bg-amber-100':''}"><option ${s==='todo'?'selected':''} value="todo">✗ Todo</option><option ${s==='done'?'selected':''} value="done">✓ Done</option><option ${s==='revise'?'selected':''} value="revise">★ Revise</option></select></td>
                  <td class="px-2 py-1 mono text-xs text-center">${q.leetcode?`<a target="_blank" href="${lcUrl(q)}" class="text-sky-700 underline decoration-dotted">${q.leetcode}</a>`:'—'}</td>
                  <td class="px-2 py-1 hand text-sm">${esc(q.title)}</td>
                  <td class="px-2 py-1 hand text-[11px]">${chList} ${chs&&chs.length>1?`<span class="chip">×${chs.length}</span>`:''}</td>
                  <td class="px-2 py-1 text-center"><span class="chip hand text-[10px] ${q.difficulty==='Easy'?'bg-emerald-50':q.difficulty==='Hard'?'bg-red-50':'bg-amber-50'}">${q.difficulty}</span></td>
                  <td class="px-2 py-1"><input value="${note.replace(/"/g,'&quot;')}" oninput="saveNote('${key}', this.value)" placeholder="pen…" class="w-full hand text-xs border border-dashed rounded-full px-2 py-1 bg-amber-50/30"></td>
                  <td class="px-2"><a target="_blank" href="${q.leetcode?`${lcUrl(q)}`: '#'}" class="text-stone-400 hover:text-stone-800"><i class="fa-solid fa-arrow-up-right-from-square text-[11px]"></i></a></td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <!-- Cards mobile -->
          <div class="md:hidden space-y-2">
            ${all.slice(0,60).map(({ch,q,chs})=>{
              const s=getQStatus(ch.id,q); const key=qKey(q,ch.id);
              return `<div class="paper rounded-xl p-3 flex gap-2 items-start ${s==='done'?'q-done':s==='revise'?'q-revise border-amber-300':''}">
                <span class="check ${s==='done'?'done':''}" onclick="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), '${s==='done'?'todo':'done'}')">${s==='done'?'✓':''}</span>
                <div class="flex-1 min-w-0">
                  <div class="hand text-sm leading-tight">${q.title} <span class="mono text-[11px] text-stone-500">LC${q.leetcode||'—'}</span></div>
                  <div class="hand text-[11px] text-stone-500">Ch ${(chs||[ch]).map(c=> String(c.id).padStart(2,'0')).join(', ')} • ${q.difficulty}</div>
                  <input value="${(progress.notes[key]||'').replace(/"/g,'&quot;')}" oninput="saveNote('${key}', this.value)" placeholder="pen notes" class="mt-1 w-full hand text-xs border border-dashed rounded-full px-2 py-1">
                </div>
                <select onchange="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), this.value)" class="hand text-[11px] border rounded-full px-1 py-0.5"><option ${s==='todo'?'selected':''} value="todo">✗</option><option ${s==='done'?'selected':''} value="done">✓</option><option ${s==='revise'?'selected':''} value="revise">★</option></select>
              </div>`;
            }).join('')}
            ${all.length>60?`<p class="hand text-xs text-center text-stone-400">Showing 60 of ${all.length} — use search/filters</p>`:''}
          </div>
        </div>
      </div>`;
    return;
  }

  const ch=DATA.chapters.find(c=>c.id===activeChapter)||DATA.chapters[0];
  const prog=chapterProgress(ch);
  let qs=ch.questions.slice();
  if(searchQ) qs=qs.filter(q=> q.title.toLowerCase().includes(searchQ.toLowerCase()));
  if(diffFilter) qs=qs.filter(q=> q.difficulty===diffFilter);
  if(statusFilter) qs=qs.filter(q=> getQStatus(ch.id,q)===statusFilter);
  let topics=(ch.topics||[]).map((t,i)=>({t,i}));
  if(searchQ) topics=topics.filter(x=> x.t.toLowerCase().includes(searchQ.toLowerCase()));

  // tab state per chapter
  if(!window.pdfTab) window.pdfTab={};
  if(!window.pdfTab[ch.id]) window.pdfTab[ch.id]='viewer';
  if(!window.chTab) window.chTab={};
  if(!window.chTab[ch.id]) window.chTab[ch.id]='questions';

  main.innerHTML=`
    <div class="paper rounded-2xl overflow-hidden">
      <div class="tape">Chapter ${String(ch.id).padStart(2,'0')} — ${ch.title} • ${prog}%</div>
      <div class="holes hidden lg:flex"><span></span><span></span><span></span><span></span><span></span><span></span></div>
      <div class="ml-0 lg:ml-10 mt-8 p-3 lg:p-4 space-y-3">
        <div class="flex flex-wrap gap-2 justify-between items-start">
          <div>
            <h2 class="serif text-[22px] leading-none">${esc(ch.title)} <span class="hand text-sm text-stone-500"> ${ch.questions.length} Qs • ${ch.topics.length} topics</span></h2>
            <p class="hand text-[11px] text-stone-500">${ch.filename} • walkthroughs ${(ch.walkthroughs||[]).map(w=>w.num).join(', ')||'—'}</p>
          </div>
          <div class="flex gap-1">
            <span class="paper px-2.5 py-1 rounded-full border hand text-xs">${prog}% inked</span>
            <button onclick="markChapterDone(${ch.id})" class="bg-stone-900 text-amber-100 serif px-3 py-1 rounded-full text-xs hover:bg-black">Mark all done</button>
          </div>
        </div>

        <!-- Chapter tabs -->
        <div class="flex gap-1 border-b border-stone-200 -mb-px">
          <button onclick="switchChTab(${ch.id}, 'questions')" id="chtab-questions-${ch.id}" class="tab ${window.chTab[ch.id]==='questions'?'active':''}">Questions • ${qs.length}</button>
          <button onclick="switchChTab(${ch.id}, 'topics')" id="chtab-topics-${ch.id}" class="tab ${window.chTab[ch.id]==='topics'?'active':''}">Topics • ${topics.length}</button>
          <button onclick="switchChTab(${ch.id}, 'pdf')" id="chtab-pdf-${ch.id}" class="tab ${window.chTab[ch.id]==='pdf'?'active':''}">PDF Notes</button>
          <button onclick="switchChTab(${ch.id}, 'notes')" id="chtab-notes-${ch.id}" class="tab ${window.chTab[ch.id]==='notes'?'active':''}">Your Notes</button>
        </div>

        <!-- Questions tab -->
        <div id="chpanel-questions-${ch.id}" class="${window.chTab[ch.id]!=='questions'?'hidden':''}">
          <div class="overflow-x-auto border border-stone-200 rounded-xl hidden md:block">
            <table class="w-full text-sm">
              <thead class="bg-stone-900 text-amber-50 hand text-xs"><tr><th class="px-2 py-2 w-8"><input type="checkbox" ${isAllDone(ch.id, qs)?'checked':''} onchange="toggleAll(this, ${ch.id})" title="Mark all ${isAllDone(ch.id, qs)?'todo':'done'}" class="accent-amber-300"></th><th class="px-2 py-2 text-left">Status</th><th class="px-2 py-2">LC</th><th class="px-2 py-2 text-left">Title</th><th class="px-2 py-2">Level</th><th class="px-2 py-2 text-left">Pen notes</th><th></th></tr></thead>
              <tbody>${qs.map(q=>{
                const s=getQStatus(ch.id,q); const key=qKey(q,ch.id); const note=progress.notes[key]||''; const cls=s==='done'?'q-done':s==='revise'?'q-revise':'';
                const pills=getCompanyTagsForLC(q.leetcode).map(c=> `<span class="chip hand text-[9px] bg-sky-50 border-sky-200" title="${c.company} ${c.frequency.toFixed(1)}">${c.company.split(' ')[0]} ${c.frequency.toFixed(0)}</span>`).join('');
                return `<tr class="border-t ${cls} hover:bg-amber-50/30">
                  <td class="px-2 py-1 text-center"><span class="check ${s==='done'?'done':''}" onclick="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), '${s==='done'?'todo':'done'}')">${s==='done'?'✓':''}</span></td>
                  <td class="px-2 py-1"><select onchange="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), this.value)" class="hand text-xs border rounded-full px-2 py-0.5 ${s==='done'?'bg-emerald-100':s==='revise'?'bg-amber-100':''}"><option ${s==='todo'?'selected':''} value="todo">✗ Todo</option><option ${s==='done'?'selected':''} value="done">✓ Done</option><option ${s==='revise'?'selected':''} value="revise">★ Revise</option></select></td>
                  <td class="px-2 py-1 mono text-xs text-center">${q.leetcode?`<a target="_blank" href="${lcUrl(q)}" class="text-sky-700 underline decoration-dotted">${q.leetcode}</a>`:'—'}</td>
                  <td class="px-2 py-1 hand text-sm">${esc(q.title)}<div class="flex flex-wrap gap-0.5 mt-0.5">${pills}</div></td>
                  <td class="px-2 py-1 text-center"><span class="chip hand text-[10px] ${q.difficulty==='Easy'?'bg-emerald-50':q.difficulty==='Hard'?'bg-red-50':'bg-amber-50'}">${q.difficulty}</span></td>
                  <td class="px-2 py-1"><input value="${note.replace(/"/g,'&quot;')}" oninput="saveNote('${key}', this.value)" placeholder="ink…" class="w-full hand text-xs border border-dashed rounded-full px-2 py-1 bg-amber-50/30"></td>
                  <td class="px-2"><a target="_blank" href="${q.leetcode?`${lcUrl(q)}`: '#'}"><i class="fa-solid fa-arrow-up-right-from-square text-[11px] text-stone-400"></i></a></td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2">
            ${qs.slice(0,50).map(q=>{
              const s=getQStatus(ch.id,q); const key=qKey(q,ch.id);
              const pillsM=getCompanyTagsForLC(q.leetcode).map(c=> `<span class="chip hand text-[9px] bg-sky-50 border-sky-200">${c.company.split(' ')[0]}${c.frequency.toFixed(0)}</span>`).join('');
              return `<div class="paper rounded-xl p-3 flex gap-2 ${s==='done'?'q-done':s==='revise'?'q-revise':''}">
                <span class="check ${s==='done'?'done':''}" onclick="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), '${s==='done'?'todo':'done'}')">${s==='done'?'✓':''}</span>
                <div class="flex-1 min-w-0"><div class="hand text-sm">${q.title} <span class="mono text-[11px]">LC${q.leetcode||'—'}</span> <span class="hidden md:inline">${pillsM}</span></div><div class="hand text-[11px] text-stone-500">${q.difficulty} • <span class="md:hidden">${pillsM}</span></div><input value="${(progress.notes[key]||'').replace(/"/g,'&quot;')}" oninput="saveNote('${key}', this.value)" placeholder="pen" class="mt-1 w-full hand text-xs border border-dashed rounded-full px-2 py-1"></div>
                <select onchange="setQStatus(${ch.id}, DATA.chapters.find(c=>c.id===${ch.id}).questions.find(x=> (x.leetcode||x.id)=='${q.leetcode||q.id}'), this.value)" class="hand text-xs border rounded-full px-1"><option ${s==='todo'?'selected':''} value="todo">✗</option><option ${s==='done'?'selected':''} value="done">✓</option><option ${s==='revise'?'selected':''} value="revise">★</option></select>
              </div>`;
            }).join('')}
            ${qs.length>50?`<p class="hand text-xs text-center">Showing 50 of ${qs.length} — filter to see more</p>`:''}
          </div>
        </div>

        <!-- Topics tab -->
        <div id="chpanel-topics-${ch.id}" class="${window.chTab[ch.id]!=='topics'?'hidden':''}">
          <div class="grid md:grid-cols-2 gap-2">
            ${topics.map(({t,i})=>{
              const done=isTopicDone(ch.id,i); const tn=progress.topicNotes[ch.id+'-'+i]||'';
              return `<div class="paper rounded-xl p-2.5 flex flex-col gap-1 ${done?'opacity-60':''}">
                <label class="flex gap-2 cursor-pointer"><span class="check ${done?'done':''}" onclick="toggleTopic(${ch.id},${i})">${done?'✓':''}</span><span class="hand text-sm flex-1 ${done?'line-through':''}">${t}</span></label>
                <input value="${tn.replace(/"/g,'&quot;')}" oninput="saveTopicNote('${ch.id+'-'+i}', this.value)" placeholder="topic note" class="hand text-xs border border-dashed rounded-full px-2 py-1 bg-amber-50/30">
              </div>`;
            }).join('')||'<p class="hand text-sm">No topics match filter</p>'}
          </div>
        </div>

        <!-- PDF Notes tab with integrated viewer -->
        <div id="chpanel-pdf-${ch.id}" class="${window.chTab[ch.id]!=='pdf'?'hidden':''}">
          <div class="flex flex-wrap gap-1 mb-2">
            <button onclick="switchPdfTab(${ch.id}, 'viewer')" id="tab-viewer-${ch.id}" class="chip hand ${window.pdfTab[ch.id]==='viewer'?'active':''}"><i class="fa-solid fa-file-pdf"></i> PDF Viewer</button>
            <button onclick="switchPdfTab(${ch.id}, 'overview')" id="tab-overview-${ch.id}" class="chip hand ${window.pdfTab[ch.id]==='overview'?'active':''}">Overview text</button>
            <button onclick="switchPdfTab(${ch.id}, 'templates')" id="tab-templates-${ch.id}" class="chip hand ${window.pdfTab[ch.id]==='templates'?'active':''}">Templates</button>
            <button onclick="switchPdfTab(${ch.id}, 'cheat')" id="tab-cheat-${ch.id}" class="chip hand ${window.pdfTab[ch.id]==='cheat'?'active':''}">Cheat Sheet</button>
            <button onclick="switchPdfTab(${ch.id}, 'pattern')" id="tab-pattern-${ch.id}" class="chip hand ${window.pdfTab[ch.id]==='pattern'?'active':''}">Checklist</button>
            <button onclick="switchPdfTab(${ch.id}, 'reference')" id="tab-reference-${ch.id}" class="chip hand ${window.pdfTab[ch.id]==='reference'?'active':''}">Reference</button>
          </div>
          <div id="pdf-viewer-${ch.id}" class="${window.pdfTab[ch.id]!=='viewer'?'hidden':''} paper rounded-xl overflow-hidden border">
            <div class="flex justify-between items-center px-2 py-1 bg-stone-100 border-b hand text-xs">
              <span class="truncate"><i class="fa-solid fa-book"></i> ${ch.filename} — actual PDF</span>
              <span class="flex gap-1">
                <a href="pdfs/${encodeURIComponent(ch.filename)}" target="_blank" class="chip hand text-[11px]">Open <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                <a href="pdfs/${encodeURIComponent(ch.filename)}" download class="chip hand text-[11px]">Download</a>
              </span>
            </div>
            <iframe src="pdfs/${encodeURIComponent(ch.filename)}#view=FitH&toolbar=1" class="w-full h-[720px] bg-white" loading="lazy" title="${ch.title} PDF"></iframe>
            <p class="hand text-[11px] text-stone-400 p-1">If viewer is blank, use Open — browser PDF viewer required. File: <code>pdfs/${ch.filename}</code></p>
          </div>
          <div id="pdf-overview-${ch.id}" class="${window.pdfTab[ch.id]!=='overview'?'hidden':''} paper rounded-xl p-3 hand text-xs whitespace-pre-wrap max-h-80 overflow-auto">${(ch.pdfNotes?.overview||'No overview').replace(/</g,'&lt;')}</div>
          <div id="pdf-templates-${ch.id}" class="${window.pdfTab[ch.id]!=='templates'?'hidden':''} paper rounded-xl p-3 bg-stone-50 max-h-80 overflow-auto"><pre class="mono text-[11px] whitespace-pre-wrap">${(ch.pdfNotes?.templates||'No templates').replace(/</g,'&lt;')}</pre></div>
          <div id="pdf-cheat-${ch.id}" class="${window.pdfTab[ch.id]!=='cheat'?'hidden':''} paper rounded-xl p-3 max-h-80 overflow-auto"><pre class="mono text-[11px] whitespace-pre-wrap">${(ch.pdfNotes?.cheatSheet||'No cheat').replace(/</g,'&lt;')}</pre></div>
          <div id="pdf-pattern-${ch.id}" class="${window.pdfTab[ch.id]!=='pattern'?'hidden':''} paper rounded-xl p-3 hand text-xs whitespace-pre-wrap max-h-80 overflow-auto">${(ch.pdfNotes?.patternChecklist||'No checklist').replace(/</g,'&lt;')}</div>
          <div id="pdf-reference-${ch.id}" class="${window.pdfTab[ch.id]!=='reference'?'hidden':''} paper rounded-xl p-3 hand text-xs whitespace-pre-wrap max-h-80 overflow-auto">${((ch.referenceText)||'No reference').replace(/</g,'&lt;')}</div>
          <p class="hand text-[11px] text-stone-400 mt-1">Extracted text for quick search • Viewer shows actual PDF</p>
        </div>

        <!-- Your Notes tab -->
        <div id="chpanel-notes-${ch.id}" class="${window.chTab[ch.id]!=='notes'?'hidden':''}">
          <div class="paper rounded-xl p-3">
            <label class="serif text-sm">Your notes — ${ch.title}</label>
            <textarea oninput="saveChapterNote(${ch.id}, this.value)" placeholder="Write tricks, mistakes, templates…" class="w-full mt-2 hand text-sm border rounded-xl p-3 bg-amber-50/20 min-h-[120px]">${(progress.chapterNotes[ch.id]||'').replace(/</g,'&lt;')}</textarea>
            <div class="mt-2 flex flex-wrap gap-1">
              ${(ch.walkthroughs||[]).map(w=>`<a target="_blank" href="${wUrl(w)}" class="chip hand">LC${w.num} ${w.title}</a>`).join('')}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
  // lazy load company index for pills (once)
  if(!companyIndexCache){
    loadCompanyIndexForChapters(qs).then(c=>{
      if(c && view==='chapters') setTimeout(()=> render(), 100);
    });
  }
}
function switchChTab(chId, tab){ window.chTab[chId]=tab; render(); }
function switchPdfTab(chId, tab){ window.pdfTab[chId]=tab; render(); }
function markChapterDone(id){ const ch=DATA.chapters.find(c=>c.id===id); ch.questions.forEach(q=> setQStatus(id,q,'done')); ch.topics.forEach((_,i)=>{ progress.topics[id+'-'+i]=true; progress._time[id+'-'+i]=Date.now(); }); save(); renderSidebar(); render(); checkChapterMilestone(id, 0); }
function saveNote(k,v){ progress.notes[k]=v; save(); }
function saveTopicNote(k,v){ progress.topicNotes[k]=v; save(); }
function saveChapterNote(id,v){ progress.chapterNotes[id]=v; save(); }
function filterChapterStatus(s){ document.getElementById('filterStatus').value=s; render(); }
function exportProgress(){
  const out={...progress, meta:{exported:new Date().toISOString(), uniqueTotal: new Set(DATA.chapters.flatMap(c=>c.questions.map(q=> q.leetcode? 'LC'+q.leetcode : c.id+'-'+q.id))).size }};
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='dsa-editorial-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
}
function importProgress(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=()=>{ try{ progress=JSON.parse(r.result); if(!progress.topics) progress.topics={}; if(!progress.questions) progress.questions={}; if(!progress.notes) progress.notes={}; if(!progress.topicNotes) progress.topicNotes={}; if(!progress.chapterNotes) progress.chapterNotes={}; if(!progress._time) progress._time={}; if(!progress.companyPrefs) progress.companyPrefs={ target:'', timeframe:'all' }; save(); renderSidebar(); render(); toast('Progress imported ✓'); }catch{ toast('Invalid backup file', true); } }; r.readAsText(f);
}
function resetAll(){ if(confirm('Erase all ink?')){ progress={topics:{},questions:{},notes:{},topicNotes:{},chapterNotes:{},_time:{}, companyPrefs:{ target:'', timeframe:'all' }}; save(); renderSidebar(); render(); } }
async function connectLC(isMobile=false){
  const input=document.getElementById(isMobile?'lcUserM':'lcUser');
  const statusEl=document.getElementById(isMobile?'lcStatusM':'lcStatus');
  const username=(input.value||document.getElementById('lcUser')?.value||document.getElementById('lcUserM')?.value||'').trim();
  if(!username){ toast('Enter your LeetCode username first', true); return; }
  progress.lcUser=username; save();
  if(statusEl) statusEl.textContent='... syncing via server';
  try{
    let solvedNums=[];
    // try server proxy first (dynamic, avoids CORS)
    try{
      const r=await fetch('/api/lc/'+encodeURIComponent(username));
      if(r.ok){
        const wrap=await r.json();
        const j=wrap.data;
        if(Array.isArray(j)) solvedNums=j.map(x=> x.titleSlug||x.title||x);
        else if(j.submission) solvedNums=j.submission.map(s=>s.titleSlug);
        else if(Array.isArray(j.submission)) solvedNums=j.submission.map(s=>s.titleSlug);
        else if(j.matchedUser) solvedNums=[];
      }
    }catch(e){}
    if(!solvedNums.length){
      for(const url of ['https://alfa-leetcode-api.onrender.com/'+username+'/acSubmission', 'https://leetcode-stats-api.herokuapp.com/'+username]){
        try{
          const r=await fetch(url);
          if(!r.ok) continue;
          const j=await r.json();
          if(Array.isArray(j)) solvedNums=j.map(x=> x.titleSlug||x.title||x);
          else if(j.submission) solvedNums=j.submission.map(s=>s.titleSlug);
          if(solvedNums.length) break;
        }catch(e){ continue; }
      }
    }
    if(!solvedNums.length){
      if(statusEl) statusEl.textContent='paste needed';
      openLcPaste();
      return;
    }
    applyLcSolved(solvedNums, username);
  }catch(e){ if(statusEl) statusEl.textContent='error'; toast(e.message, true); }
  const v=progress.lcUser; const a=document.getElementById('lcUser'), b=document.getElementById('lcUserM'); if(a) a.value=v; if(b) b.value=v;
}
function applyLcSolved(solvedNums, username){
  const slugToNum={};
  DATA.chapters.forEach(c=> c.questions.forEach(q=>{ if(q.leetcode) slugToNum[slugify(q.title)]=q.leetcode; if(q.slug) slugToNum[q.slug]=q.leetcode; }));
  let synced=0;
  for(const raw of solvedNums){
    const it=String(raw||'').trim();
    if(!it) continue;
    let num=null;
    if(/^\d+$/.test(it)) num=parseInt(it,10);
    else if(slugToNum[it.toLowerCase()]) num=slugToNum[it.toLowerCase()];
    if(num){
      const key='LC'+num;
      if(progress.questions[key]!=='done'){ progress.questions[key]='done'; progress._time[key]=Date.now(); }
      synced++;
    }
  }
  save();
  const a=document.getElementById('lcStatus'), b=document.getElementById('lcStatusM');
  if(a) a.textContent='✓ '+synced+' synced';
  if(b) b.textContent='✓ '+synced+' synced';
  toast('Synced '+synced+' for '+username+' ('+(authToken?'server':'local')+')');
  renderSidebar(); render();
}
function openLcPaste(){ document.getElementById('lcModal').classList.remove('hidden'); const m=document.getElementById('lcPasteMsg'); if(m) m.textContent=''; const t=document.getElementById('lcPaste'); if(t) t.focus(); }
function closeLcPaste(){ document.getElementById('lcModal').classList.add('hidden'); }
function submitLcPaste(){
  const t=document.getElementById('lcPaste');
  const items=(t.value||'').split(/[,\s]+/).filter(Boolean);
  const msg=document.getElementById('lcPasteMsg');
  if(!items.length){ if(msg) msg.textContent='Paste at least one number or slug'; return; }
  const username=(document.getElementById('lcUser')?.value||document.getElementById('lcUserM')?.value||progress.lcUser||'').trim()||'you';
  closeLcPaste();
  applyLcSolved(items, username);
}
load();
