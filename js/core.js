let DATA=null;
let progress = JSON.parse(localStorage.getItem('dsa-tracker-v3')|| localStorage.getItem('dsa-tracker-v2')|| '{}');
if(!progress.questions) progress={topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}};
if(!progress.topics) progress.topics={};
if(!progress.questions) progress.questions={};
if(!progress.notes) progress.notes={};
if(!progress.topicNotes) progress.topicNotes={};
if(!progress.chapterNotes) progress.chapterNotes={};
if(!progress._time) progress._time={};
(function migrate(){
  for(const k of Object.keys(progress.questions)){
    if(/^\d+-LC\d+/.test(k) || /^\d+-\d+/.test(k)){
      const lc=k.split('-')[1];
      if(lc?.startsWith('LC') && progress.questions[lc]===undefined) progress.questions[lc]=progress.questions[k];
      else if(/^\d+$/.test(lc) && progress.questions['LC'+lc]===undefined) progress.questions['LC'+lc]=progress.questions[k];
    }
  }
  for(const k of Object.keys(progress.notes)){
    if(/^\d+-LC/.test(k)){
      const lc=k.split('-')[1];
      if(lc && progress.notes[lc]===undefined) progress.notes[lc]=progress.notes[k];
    }
  }
})();
let activeChapter=1;
let view='chapters';
let searchQ='';
let phaseCollapsed={};
let authToken=localStorage.getItem('dsa-jwt')||'';
let authUser=JSON.parse(localStorage.getItem('dsa-user')||'null');
// Company-wise state
let companiesMeta=null;
let selectedCompany='amazon';
let selectedTimeframe='30d';
let companyPage=1;
let companyLimit=50;
let companySearch='';
let companySort='frequency';
let companyMinFreq=0;
let companyData=null;
let companyIndexCache=null; // lcId -> companies array
let companyLoading=false;
let cmdActive=0;
if(!progress.companyPrefs) progress.companyPrefs={ target:'', timeframe:'all' };
if(!progress.recent) progress.recent=[];
if(!progress._milestones) progress._milestones={};
if(!progress.srs) progress.srs={};
let companyDiffFilter='';
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toggleTheme(){ const dark=document.body.classList.toggle('dark'); try{ localStorage.setItem('dsa-theme', dark?'dark':'light'); }catch{} updateThemeIcon(); }
function updateThemeIcon(){ const b=document.getElementById('themeBtn'); if(b) b.innerHTML=document.body.classList.contains('dark')?'<i class="fa-solid fa-sun"></i>':'<i class="fa-solid fa-moon"></i>'; }
function initTheme(){ try{ if(localStorage.getItem('dsa-theme')==='dark') document.body.classList.add('dark'); }catch{} updateThemeIcon(); }
initTheme();
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('/sw.js').catch(e=> console.log('SW fail', e)));
}
function updateNetBadge(){ const d=document.getElementById('netDot'); if(!d) return; const on=navigator.onLine; d.className='w-2 h-2 rounded-full shrink-0 '+(on?'bg-emerald-500':'bg-red-500'); d.title=on?'Online':'Offline — cached version active'; }
window.addEventListener('online', ()=>{ updateNetBadge(); toast('Back online ✓'); });
window.addEventListener('offline', ()=>{ updateNetBadge(); toast('Offline — cached version active', true); });
updateNetBadge();
function toast(msg, isErr){
  const box=document.getElementById('toasts');
  if(!box){ alert(msg); return; }
  const t=document.createElement('div');
  t.className='toast'+(isErr?' err':''); t.textContent=msg;
  box.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=> t.remove(), 300); }, 2600);
}

function openAuth(){ document.getElementById('authModal').classList.remove('hidden'); }
function closeAuth(){ document.getElementById('authModal').classList.add('hidden'); const m=document.getElementById('authMsg'); if(m) m.textContent=''; }
function updateAuthUI(){
  const u=authUser;
  const userEl=document.getElementById('authUser');
  const btn=document.getElementById('authBtn');
  const out=document.getElementById('logoutBtn');
  if(u){
    if(userEl){ userEl.textContent='Hi, '+u.name; userEl.classList.remove('hidden'); }
    if(btn) btn.classList.add('hidden');
    if(out) out.classList.remove('hidden');
  } else {
    if(userEl) userEl.classList.add('hidden');
    if(btn) btn.classList.remove('hidden');
    if(out) out.classList.add('hidden');
  }
}
async function doRegister(){
  const name=document.getElementById('authName').value.trim();
  const email=document.getElementById('authEmail').value.trim();
  const pass=document.getElementById('authPass').value;
  const msgEl=document.getElementById('authMsg');
  if(!email||!pass){ msgEl.textContent='Email and password required'; return; }
  try{
    const r=await fetch('/api/register',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password:pass,name})});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'register failed');
    authToken=j.token; authUser=j.user;
    localStorage.setItem('dsa-jwt', authToken); localStorage.setItem('dsa-user', JSON.stringify(authUser));
    await fetch('/api/progress',{method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken}, body:JSON.stringify(progress)});
    msgEl.textContent='Registered — welcome '+authUser.name;
    updateAuthUI(); setTimeout(closeAuth, 600); await loadFromServer();
  }catch(e){ msgEl.textContent=e.message; }
}
async function doLogin(){
  const email=document.getElementById('authEmail').value.trim();
  const pass=document.getElementById('authPass').value;
  const msgEl=document.getElementById('authMsg');
  if(!email||!pass){ msgEl.textContent='Email and password required'; return; }
  try{
    const r=await fetch('/api/login',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password:pass})});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'login failed');
    authToken=j.token; authUser=j.user;
    localStorage.setItem('dsa-jwt', authToken); localStorage.setItem('dsa-user', JSON.stringify(authUser));
    msgEl.textContent='Logged in — syncing...';
    updateAuthUI(); await loadFromServer(); setTimeout(closeAuth, 500);
  }catch(e){ msgEl.textContent=e.message; }
}
function doLogout(){
  authToken=''; authUser=null;
  localStorage.removeItem('dsa-jwt'); localStorage.removeItem('dsa-user');
  updateAuthUI();
  renderSidebar(); render();
}
async function loadFromServer(){
  if(!authToken) return;
  try{
    const r=await fetch('/api/progress',{headers:{'Authorization':'Bearer '+authToken}});
    if(!r.ok) throw new Error('no auth');
    const j=await r.json();
    progress=j;
    if(!progress.topics) progress.topics={};
    if(!progress.questions) progress.questions={};
    if(!progress.notes) progress.notes={};
    if(!progress.topicNotes) progress.topicNotes={};
    if(!progress.chapterNotes) progress.chapterNotes={};
    if(!progress._time) progress._time={};
    if(!progress.recent) progress.recent=[];
    if(!progress._milestones) progress._milestones={};
    if(!progress.srs) progress.srs={};
    localStorage.setItem('dsa-tracker-v3', JSON.stringify(progress));
    renderSidebar(); render();
  }catch(e){ console.log('loadFromServer failed', e); }
}
async function syncToServer(){
  if(!authToken) return;
  try{ await fetch('/api/progress',{method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken}, body:JSON.stringify(progress)}); }catch(e){ console.log('sync fail', e); }
}

