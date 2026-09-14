#!/usr/bin/env node
// Ingest liquidslr/leetcode-company-wise-problems CSVs -> data/companies_meta.json + data/companies/<slug>.json + data/company_index.json + data/companies.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
const LC_MAP_PATH = path.join(DATA_DIR, 'lc_map.json');

const TIMEFRAMES = [
  { file: '1. Thirty Days.csv', key: '30d' },
  { file: '2. Three Months.csv', key: '3m' },
  { file: '3. Six Months.csv', key: '6m' },
  { file: '4. More Than Six Months.csv', key: 'gt6m' },
  { file: '5. All.csv', key: 'all' },
];

// Priority list - will be intersected with actual repo folders (case-sensitive)
const PRIORITY_COMPANIES = [
  'Amazon','Google','Microsoft','Meta','Apple','Bloomberg','Uber','Adobe','Goldman Sachs','Oracle',
  'ByteDance','Atlassian','Cisco','Intel','Airbnb','Netflix','LinkedIn','Twitter','PayPal','Salesforce',
  'JPMorgan','Morgan Stanley','American Express','eBay','Spotify','Visa','Intuit','Deloitte','Accenture',
  'Flipkart','Walmart Global Tech','Walmart','Infosys','TCS','Paytm','Swiggy','Ola','Walmart Labs','Yahoo','JPMorgan Chase'
];

function slugifyCompany(name){
  return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function capDiff(d){
  if(!d) return 'Medium';
  const m=d.toLowerCase();
  if(m==='easy') return 'Easy';
  if(m==='hard') return 'Hard';
  return 'Medium';
}
function parseCSV(text){
  const rows=[];
  let i=0, field='', row=[], inQuotes=false;
  while(i<text.length){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){
        if(text[i+1]==='"'){ field+='"'; i+=2; continue; }
        else { inQuotes=false; i++; continue; }
      } else { field+=c; i++; continue; }
    } else {
      if(c==='"'){ inQuotes=true; i++; continue; }
      if(c===','){ row.push(field); field=''; i++; continue; }
      if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; i++; continue; }
      if(c==='\r'){ i++; continue; }
      field+=c; i++;
    }
  }
  if(field!=='' || row.length){ row.push(field); rows.push(row); }
  return rows;
}
function extractSlug(link){
  if(!link) return null;
  const m=link.match(/\/problems\/([^\/\?#]+)/);
  if(m) return m[1].toLowerCase();
  return null;
}

async function fetchWithRetry(url, tries=3){
  for(let a=0;a<tries;a++){
    try{
      const r=await fetch(url, {headers:{'User-Agent':'dsa-tracker-ingest/1.0'}});
      if(r.status===404) return null;
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    }catch(e){
      if(a===tries-1) throw e;
      await new Promise(res=>setTimeout(res, 500*(a+1)));
    }
  }
}

async function getCompanyList(){
  // Try GitHub API
  try{
    const r=await fetch('https://api.github.com/repos/liquidslr/leetcode-company-wise-problems/contents', {headers:{'User-Agent':'dsa-tracker','Accept':'application/vnd.github.v3+json'}});
    if(r.ok){
      const j=await r.json();
      const dirs=j.filter(x=>x.type==='dir').map(x=>x.name);
      console.log(`Fetched ${dirs.length} companies from GitHub API`);
      return dirs;
    }
  }catch(e){ console.warn('GitHub API failed, fallback', e.message); }
  // fallback to priority
  return PRIORITY_COMPANIES;
}

async function main(){
  const limit = Number(process.env.COMPANY_LIMIT || 40);
  const mode = process.env.COMPANY_MODE || 'priority'; // priority | all
  console.log(`Ingest starting: mode=${mode} limit=${limit}`);
  if(!fs.existsSync(LC_MAP_PATH)){ console.error('lc_map.json not found'); process.exit(1); }
  const lcMap=JSON.parse(fs.readFileSync(LC_MAP_PATH,'utf-8'));
  const slugToId={};
  for(const [id, slug] of Object.entries(lcMap.id_to_slug||{})){
    slugToId[slug.toLowerCase()]=parseInt(id);
  }
  const titleToId={};
  for(const [t,id] of Object.entries(lcMap.title_to_id||{})){
    titleToId[t.toLowerCase()]=parseInt(id);
  }

  let allCompanies = await getCompanyList();
  // Prioritize
  let targetCompanies;
  if(mode==='all'){
    targetCompanies = allCompanies.slice(0, limit);
  } else {
    const set=new Set(allCompanies);
    const prioritized = PRIORITY_COMPANIES.filter(c=> set.has(c));
    const remaining = allCompanies.filter(c=> !prioritized.includes(c));
    targetCompanies = [...prioritized, ...remaining].slice(0, limit);
  }
  console.log(`Target companies (${targetCompanies.length}): ${targetCompanies.join(', ')}`);

  if(!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, {recursive:true});

  const companiesMeta=[];
  const companyIndex={}; // LCxx -> [{company, slug, frequency, timeframe}]
  const aggregated=[];

  let totalQs=0;
  let fetchCount=0;

  for(const company of targetCompanies){
    const slug=slugifyCompany(company);
    const existingPath=path.join(COMPANIES_DIR, `${slug}.json`);
    const doResume=process.env.RESUME==='1' || process.env.RESUME==='true';
    if(doResume && fs.existsSync(existingPath)){
      try{
        const existing=JSON.parse(fs.readFileSync(existingPath,'utf-8'));
        console.log(`\n[${targetCompanies.indexOf(company)+1}/${targetCompanies.length}] ${company} (${slug}) — RESUME cache hit, skipping fetch`);
        // rebuild index from cached file
        for(const tf of TIMEFRAMES){
          const qs=existing.timeframes?.[tf.key]||[];
          for(const q of qs){
            if(q.lcId){
              const k=`LC${q.lcId}`;
              if(!companyIndex[k]) companyIndex[k]=[];
              if(!companyIndex[k].some(e=> e.slug===slug && e.timeframe===tf.key)){
                companyIndex[k].push({ company, slug, frequency: q.frequency, timeframe: tf.key, difficulty: q.difficulty });
              }
            }
          }
          totalQs+=qs.length;
        }
        companiesMeta.push({ name: company, slug, counts: existing.counts, updated: existing.updated });
        aggregated.push(existing);
        continue;
      }catch(e){ console.log(' resume parse fail, refetch', e.message); }
    }
    console.log(`\n[${targetCompanies.indexOf(company)+1}/${targetCompanies.length}] ${company} (${slug})`);
    const timeframes={};
    const counts={};
    for(const tf of TIMEFRAMES){
      const url=`https://raw.githubusercontent.com/liquidslr/leetcode-company-wise-problems/main/${encodeURIComponent(company)}/${encodeURIComponent(tf.file)}`;
      try{
        const csvText=await fetchWithRetry(url);
        fetchCount++;
        if(csvText===null){ console.log(`  ${tf.key}: not found`); counts[tf.key]=0; timeframes[tf.key]=[]; continue; }
        const rows=parseCSV(csvText);
        if(!rows.length){ counts[tf.key]=0; timeframes[tf.key]=[]; continue; }
        const header=rows[0].map(h=>h.trim());
        const idx={
          Difficulty: header.indexOf('Difficulty'),
          Title: header.indexOf('Title'),
          Frequency: header.indexOf('Frequency'),
          Acceptance: header.indexOf('Acceptance Rate'),
          Link: header.indexOf('Link'),
          Topics: header.indexOf('Topics')
        };
        const questions=[];
        const seen=new Set();
        for(let ri=1; ri<rows.length; ri++){
          const row=rows[ri];
          if(!row || row.length < header.length) continue;
          const Title=(row[idx.Title]||'').trim();
          if(!Title) continue;
          const Link=(row[idx.Link]||'').trim();
          const slugQ=extractSlug(Link) || Title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
          let lcId=null;
          if(slugQ && slugToId[slugQ]) lcId=slugToId[slugQ];
          else if(titleToId[Title.toLowerCase()]) lcId=titleToId[Title.toLowerCase()];
          else if(slugQ){
             const normTitle=Title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
             if(titleToId[normTitle]) lcId=titleToId[normTitle];
          }
          // dedup per company per timeframe by lcId or slug
          const key=lcId ? `LC${lcId}` : `SLUG:${slugQ}`;
          if(seen.has(key)) continue;
          seen.add(key);
          const Difficulty=capDiff(row[idx.Difficulty]);
          const Frequency=parseFloat(row[idx.Frequency]||'0')||0;
          const Acceptance=parseFloat(row[idx.Acceptance]||'0')||0;
          const TopicsRaw=(row[idx.Topics]||'').trim();
          const Topics=TopicsRaw ? TopicsRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
          questions.push({
            lcId: lcId || null,
            title: Title,
            slug: slugQ,
            difficulty: Difficulty,
            frequency: Frequency,
            acceptance: Acceptance,
            topics: Topics,
            link: Link
          });
          if(lcId){
            const k=`LC${lcId}`;
            if(!companyIndex[k]) companyIndex[k]=[];
            // avoid duplicate company entry same timeframe
            if(!companyIndex[k].some(e=> e.slug===slug && e.timeframe===tf.key)){
              companyIndex[k].push({ company, slug, frequency: Frequency, timeframe: tf.key, difficulty: Difficulty });
            }
          }
        }
        // sort by frequency desc
        questions.sort((a,b)=> b.frequency - a.frequency);
        timeframes[tf.key]=questions;
        counts[tf.key]=questions.length;
        totalQs+=questions.length;
        console.log(`  ${tf.key}: ${questions.length} Qs`);
        // small delay to avoid hammering
        await new Promise(r=>setTimeout(r, 120));
      }catch(e){
        console.warn(`  ${tf.key} failed: ${e.message}`);
        counts[tf.key]=0;
        timeframes[tf.key]=[];
      }
    }
    const out={
      name: company,
      slug,
      counts,
      timeframes,
      // for easy access: all timeframe combined unique
      updated: new Date().toISOString().slice(0,10)
    };
    // Deduplicate all across timeframes for aggregated view: use all if exists else largest
    fs.writeFileSync(path.join(COMPANIES_DIR, `${slug}.json`), JSON.stringify(out, null, 2));
    companiesMeta.push({ name: company, slug, counts, updated: out.updated });
    aggregated.push(out);
    // throttle between companies
    await new Promise(r=>setTimeout(r, 200));
  }

  // Sort companyIndex entries by frequency desc
  for(const k of Object.keys(companyIndex)){
    companyIndex[k].sort((a,b)=> b.frequency - a.frequency);
  }

  // Write meta
  fs.writeFileSync(path.join(DATA_DIR, 'companies_meta.json'), JSON.stringify({ updated: new Date().toISOString(), totalCompanies: companiesMeta.length, totalQuestions: totalQs, fetches: fetchCount, companies: companiesMeta.sort((a,b)=> (b.counts.all||0)-(a.counts.all||0)) }, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'company_index.json'), JSON.stringify(companyIndex, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'companies.json'), JSON.stringify({ updated: new Date().toISOString(), companies: aggregated }, null, 2));
  console.log(`\nDone: ${companiesMeta.length} companies, ${totalQs} rows, ${Object.keys(companyIndex).length} unique LC indexed`);
  console.log(`Wrote: data/companies_meta.json, data/company_index.json, data/companies.json, data/companies/*.json`);

  // Overlap report
  try{
    const dsa=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'dsa.json'),'utf-8'));
    const dsaIds=new Set(dsa.chapters.flatMap(c=> c.questions.map(q=> q.leetcode ? `LC${q.leetcode}`: null).filter(Boolean)));
    let overlap=0, totalIndexed=Object.keys(companyIndex).length;
    for(const k of Object.keys(companyIndex)) if(dsaIds.has(k)) overlap++;
    console.log(`Overlap with dsa.json: ${overlap}/${totalIndexed} (${((overlap/totalIndexed)*100).toFixed(1)}%) company Qs present in DSA tracker`);
  }catch(e){}
}

main().catch(e=>{ console.error(e); process.exit(1); });
