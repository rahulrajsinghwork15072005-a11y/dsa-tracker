const PHASES=[
  {name:'Foundations', range:[1,8], desc:'Array • Hash • Two-ptr • Sliding • Prefix'},
  {name:'Search & Heap', range:[9,12], desc:'Binary Search • Heap • Quickselect'},
  {name:'Stack & Queue', range:[13,15], desc:'Stack • Monotonic'},
  {name:'Linked List', range:[16,17], desc:'List • Fast/Slow'},
  {name:'Recursion', range:[18,19], desc:'Recursion • Backtracking'},
  {name:'Trees', range:[20,23], desc:'DFS • BFS • BST • Ordered Set'},
  {name:'Graphs', range:[24,30], desc:'DFS • BFS • Topo • DSU • Shortest • MST'},
  {name:'Greedy & Intervals', range:[31,33], desc:'Greedy • Interval • Sweep'},
  {name:'Dynamic Programming', range:[34,43], desc:'DP 10 ch — 1D to Digit'},
  {name:'Strings', range:[44,48], desc:'String • Palindrome • Trie • Hash • Parsing'},
  {name:'Bit & Math', range:[49,53], desc:'Bit • Number Theory • Counting • Game'},
  {name:'Design', range:[54,56], desc:'Design • System Lite • Concurrency'},
];
async function load(){
  const r=await fetch('data/dsa.json');
  DATA=await r.json();
  try{ const m=await fetch('data/lc_map.json'); if(m.ok){ const mj=await m.json(); window.lcIdToSlug=mj.id_to_slug||{}; window.lcTitleToId=mj.title_to_id||{}; } }catch(e){}
  updateAuthUI();
  if(authToken){
    try{ await loadFromServer(); }catch(e){}
  }
  // init LC user display (also from progress.lcUser)
  const lcU = progress.lcUser || authUser?.email || '';
  if(lcU){
    const a=document.getElementById('lcUser'), b=document.getElementById('lcUserM');
    if(a) a.value=progress.lcUser||'';
    if(b) b.value=progress.lcUser||'';
    const s=document.getElementById('lcStatus'); if(s && progress.lcUser) s.textContent='linked: '+progress.lcUser;
  }
  // load companies meta (non-blocking)
  loadCompaniesMeta();
  // restore company prefs
  if(progress.companyPrefs && progress.companyPrefs.target){
    selectedCompany=progress.companyPrefs.target;
    selectedTimeframe=progress.companyPrefs.timeframe||'30d';
  }
  renderSidebar();
  render();
  if(!Object.keys(progress._time||{}).length) setTimeout(()=> toast('Welcome — press ⌘K to search, J/K to move, C to tick done'), 700);
  ['authName','authEmail','authPass'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); }); });
}
function populateCompanySelect(filter=''){
  const sel=document.getElementById('companySelect');
  if(!sel || !companiesMeta || !companiesMeta.companies) return;
  const q=filter.toLowerCase().trim();
  let list=companiesMeta.companies;
  if(q) list=list.filter(c=> c.name.toLowerCase().includes(q) || c.slug.includes(q));
  const display=list.slice(0,80);
  sel.innerHTML=display.map(c=> `<option value="${c.slug}" ${c.slug===selectedCompany?'selected':''}>${c.name} — All:${c.counts.all} • 30d:${c.counts['30d']||0}</option>`).join('') || '<option>No match</option>';
  document.getElementById('companyCountLabel').textContent = list.length + (q ? ` of 470 filtered` : ` companies`);
  const chipEl=document.getElementById('topCompanyChips');
  if(chipEl){
    const tops=companiesMeta.companies.slice(0,8);
    chipEl.innerHTML=tops.map(c=> `<button onclick="selectedCompany='${c.slug}'; companyPage=1; document.getElementById('companySelect').value='${c.slug}'; loadCompanyData(); updateCompanyTierActive();" class="chip hand text-[10px] ${c.slug===selectedCompany?'bg-stone-900 text-white':''}">${c.name.split(' ')[0]}</button>`).join('');
  }
  const miniEl=document.getElementById('companyMiniChips');
  if(miniEl && companiesMeta.companies){
    const miniTop=companiesMeta.companies.slice(0,6);
    miniEl.innerHTML=miniTop.map(c=> `<button onclick="selectedCompany='${c.slug}'; view='companies'; updateViewBtns(); loadCompanyData(); window.scrollTo({top:0,behavior:'smooth'})" class="chip hand text-[10px] ${c.slug===selectedCompany && progress.companyPrefs.target===c.slug?'bg-amber-200':''}">${c.name.split(' ')[0]}</button>`).join('');
  }
  // tier list
  const tierEl=document.getElementById('companyTierList');
  if(tierEl){
    const tiers=[
      {label:'🔥 Hot 30d (≥20)', test:c=> (c.counts['30d']||0)>=20},
      {label:'🏢 Large All (≥150)', test:c=> c.counts.all>=150 && (c.counts['30d']||0)<20},
      {label:'📦 Mid All (50-149)', test:c=> c.counts.all>=50 && c.counts.all<150},
      {label:'🌱 Small', test:c=> c.counts.all<50 && c.counts.all>0},
      {label:'🪶 Zero (all 0)', test:c=> c.counts.all===0},
    ];
    let html='';
    for(const tier of tiers){
      const members=list.filter(tier.test).slice(0,12);
      if(!members.length) continue;
      html+=`<div><div class="hand text-[10px] tracking-widest text-stone-400 mt-1">${tier.label} • ${list.filter(tier.test).length}</div><div class="flex flex-wrap gap-0.5">`;
      for(const c of members){
        const active=c.slug===selectedCompany;
        const pct=c.counts.all? Math.min(100, Math.round(c.counts.all/24.34)) : 0; // 2344 max
        html+=`<button onclick="selectedCompany='${c.slug}'; companyPage=1; document.getElementById('companySelect').value='${c.slug}'; loadCompanyData(); updateCompanyTierActive();" class="chip hand text-[10px] ${active?'bg-stone-900 text-white border-stone-900':'bg-white'}">${c.name.split(' ')[0]} <span class="opacity-60">${c.counts.all}</span></button>`;
      }
      if(list.filter(tier.test).length>12) html+=`<span class="hand text-[10px] text-stone-400">+${list.filter(tier.test).length-12} more — use search</span>`;
      html+=`</div></div>`;
    }
    tierEl.innerHTML=html || '<p class="hand text-xs text-stone-400">No companies match filter</p>';
    updateCompanyTierActive();
  }
}
function updateCompanyTierActive(){
  // highlight active in tier list handled via re-render, also update select
  const sel=document.getElementById('companySelect');
  if(sel) sel.value=selectedCompany;
}
function filterCompanyPicker(q){
  populateCompanySelect(q);
}
// Board ∞ Wikiboard
