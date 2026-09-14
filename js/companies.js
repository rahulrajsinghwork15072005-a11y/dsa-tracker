async function loadCompaniesMeta(){
  try{
    const r=await fetch('/api/companies');
    if(!r.ok) throw new Error('no meta');
    companiesMeta=await r.json();
    populateCompanySelect(document.getElementById('companyFilter')?.value||'');
    updateTargetBadge();
    if(view==='companies') loadCompanyData();
  }catch(e){
    console.log('companies meta fail', e);
    try{
      const r2=await fetch('data/companies_meta.json');
      if(r2.ok){
        companiesMeta=await r2.json();
        populateCompanySelect(document.getElementById('companyFilter')?.value||'');
        updateTargetBadge();
      }
    }catch{}
  }
}
async function loadCompanyData(){
  if(companyLoading) return;
  companyLoading=true;
  try{
    const params=new URLSearchParams({
      timeframe: selectedTimeframe,
      sort: companySort,
      page: String(companyPage),
      limit: String(companyLimit),
      q: companySearch||'',
      minFreq: String(companyMinFreq||0)
    });
    const diff=companyDiffFilter||'';
    if(diff) params.set('difficulty', diff);
    const url=`/api/company/${encodeURIComponent(selectedCompany)}?${params.toString()}`;
    const r=await fetch(url, {headers: authToken ? { 'Authorization':'Bearer '+authToken } : {}});
    if(!r.ok) throw new Error('company fetch '+r.status);
    companyData=await r.json();
    companyLoading=false;
    render();
    return;
  }catch(e){
    console.log('loadCompanyData fail', e);
    const el=document.getElementById('mainContent');
    if(el && view==='companies') el.innerHTML=`<div class="paper rounded-2xl p-6 text-center hand"><p class="serif text-lg">Couldn't load ${esc(selectedCompany)}</p><p class="hand text-xs text-stone-500">${esc(e.message)}</p><div class="flex gap-1 justify-center mt-2"><button onclick="loadCompanyData()" class="chip hand bg-stone-900 text-white">↻ Retry</button><a href="data/companies/${encodeURIComponent(selectedCompany)}.json" target="_blank" class="chip hand underline">raw JSON</a></div></div>`;
  } finally { companyLoading=false; if(view==='companies' && companyData) render(); }
}
function onCompanyChange(v){
  selectedCompany=v;
  companyPage=1;
  loadCompanyData();
}
function onCompanyTimeframe(tf){
  selectedTimeframe=tf;
  companyPage=1;
  loadCompanyData();
}
function onCompanySearch(v){
  companySearch=v;
  companyPage=1;
  clearTimeout(window._coSearchTimer);
  window._coSearchTimer=setTimeout(()=> loadCompanyData(), 300);
}
function onCompanySort(v){ companySort=v; loadCompanyData(); }
function onCompanyMinFreq(v){ companyMinFreq=Number(v); document.getElementById('freqVal').textContent=v; loadCompanyData(); }
function changeCompanyPage(d){
  if(!companyData) return;
  const maxPage=Math.ceil(companyData.total/companyLimit);
  companyPage=Math.min(maxPage, Math.max(1, companyPage+d));
  loadCompanyData();
}
function setCompanyTarget(){
  progress.companyPrefs={ target: selectedCompany, timeframe: selectedTimeframe };
  save();
  updateTargetBadge();
  renderStats();
  if(view==='companies') render();
}
function clearCompanyTarget(){
  progress.companyPrefs={ target:'', timeframe:'all' };
  save();
  updateTargetBadge();
  renderStats();
}
function updateTargetBadge(){
  const badge=document.getElementById('targetBadge');
  const nameEl=document.getElementById('targetName');
  const btn=document.getElementById('targetBtn');
  const target=progress.companyPrefs?.target||'';
  if(target){
    if(badge) badge.classList.remove('hidden');
    if(nameEl) nameEl.textContent= target + ' • ' + (progress.companyPrefs.timeframe||'all');
    if(btn) btn.textContent='✓ Targeted';
  } else {
    if(badge) badge.classList.add('hidden');
    if(btn) btn.textContent='★ Target';
  }
}
async function loadCompanyIndexForChapters(qs){
  if(companyIndexCache) return companyIndexCache;
  try{
    const r=await fetch('data/company_index.json');
    if(!r.ok) return null;
    const j=await r.json();
    // if huge, only keep for needed ids
    companyIndexCache=j;
    return j;
  }catch{ return null; }
}
function getCompanyTagsForLC(lcId){
  if(!companyIndexCache || !lcId) return [];
  const arr=companyIndexCache['LC'+lcId]||[];
  // dedup by slug already in index but sort by freq
  const m=new Map();
  for(const e of arr){ if(!m.has(e.slug) || e.frequency>m.get(e.slug).frequency) m.set(e.slug, e); }
  return [...m.values()].sort((a,b)=> b.frequency-a.frequency).slice(0,3);
}
function setCompanyQStatus(lcId, slug, status){
  const key= lcId ? 'LC'+lcId : 'SLUG:'+slug;
  progress.questions[key]=status;
  progress._time[key]=Date.now();
  save();
  // update companyData in place for instant feedback without refetch
  if(companyData && companyData.questions){
    const q=companyData.questions.find(x=> (x.lcId && String(x.lcId)===String(lcId)) || x.slug===slug);
    if(q) q.status=status;
  }
  render();
}
function persistProgress(){ try{ localStorage.setItem('dsa-tracker-v3', JSON.stringify(progress)); localStorage.setItem('dsa-tracker-v2', JSON.stringify(progress)); }catch{} syncToServer(); }
