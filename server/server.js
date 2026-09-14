import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACKER_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROG_DIR = path.join(DATA_DIR, 'progress');
const JWT_SECRET_FILE = path.join(DATA_DIR, 'jwt_secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROG_DIR)) fs.mkdirSync(PROG_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));

let JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  if (fs.existsSync(JWT_SECRET_FILE)) JWT_SECRET = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
  else { JWT_SECRET = 'dsa-paper-ink-' + crypto.randomBytes(16).toString('hex'); fs.writeFileSync(JWT_SECRET_FILE, JWT_SECRET); }
}

const logger = pino({ level: process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug'), redact: { paths: ['req.headers.authorization', 'req.body.password'], remove: true } });

const app = express();
if (NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');

// Request ID + structured logging
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customProps: (req) => ({ user: req.user?.id }),
  autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/readyz' }
}));

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://alfa-leetcode-api.onrender.com", "https://leetcode-stats-api.herokuapp.com", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

const allowedOrigins = NODE_ENV === 'production' && process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000'];

app.use(cors({
  origin(origin, cb) { if (!origin || allowedOrigins.includes(origin)) return cb(null, true); cb(new Error('Not allowed by CORS')); },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-Id']
}));
app.use(compression());
app.use(express.json({ limit: '5mb' }));

// Rate limiters
const ipKey = (req) => ipKeyGenerator(req.ip || 'unknown');
const authLimiter = rateLimit({ windowMs: 60_000, limit: Number(process.env.AUTH_RATE_LIMIT || 30), standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: ipKey, skipSuccessfulRequests: true, message: { error: 'Too many failed auth attempts - wait a minute' } });
const globalLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: ipKey });
app.use('/api/', globalLimiter);

// Metrics (lightweight, no prom-client)
const reqDurations = [];
const requestDurationMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const sec = Number(process.hrtime.bigint() - start) / 1e9;
    reqDurations.push(sec);
    if (reqDurations.length > 1000) reqDurations.shift();
  });
  next();
};
app.use(requestDurationMiddleware);

// Health & readiness
app.get('/api/health', (_req, res) => {
  let users = 0; try { users = JSON.parse(fs.readFileSync(USERS_FILE,'utf-8')).length; } catch {}
  res.json({ status: 'ok', db: 'ok', uptime: Math.round(process.uptime()), users, time: new Date().toISOString() });
});
app.get('/api/readyz', (_req, res) => {
  try { fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK); res.json({ status: 'ready', db: 'ok', uptime: Math.round(process.uptime()) }); }
  catch (e) { res.status(503).json({ status: 'not_ready', error: e.message }); }
});
app.get('/api/metrics', (_req, res) => {
  const avg = reqDurations.length ? (reqDurations.reduce((a,b)=>a+b,0)/reqDurations.length).toFixed(3) : 0;
  res.type('text/plain').send(`# HELP http_request_duration_seconds Avg request duration\n# TYPE http_request_duration_seconds gauge\nhttp_request_duration_seconds_avg ${avg}\nhttp_requests_total ${reqDurations.length}\nuptime_seconds ${Math.round(process.uptime())}\n`);
});

// OpenAPI docs
app.get('/api/docs/openapi.yaml', (_req, res) => {
  const p = path.join(__dirname, '..', 'openapi.yaml');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'openapi.yaml not found' });
  res.type('text/yaml').send(fs.readFileSync(p, 'utf-8'));
});
app.get('/api/docs', (_req, res) => {
  res.type('html').send(`<!doctype html><title>DSA Tracker API Docs</title><style>body{font-family:system-ui;padding:24px;max-width:900px;margin:auto}pre{background:#f6f6f6;padding:12px;overflow:auto}a{color:#2563eb}</style>
<h1>DSA Tracker API</h1><p>Spec: <a href="/api/docs/openapi.yaml">openapi.yaml</a> • Health: <a href="/api/health">/api/health</a></p><pre>${(() => { try { return fs.readFileSync(path.join(__dirname,'..','openapi.yaml'),'utf-8').slice(0,8000).replace(/</g,'&lt;'); } catch { return 'openapi.yaml not found'; }})()}</pre>`);
});

// Static
app.use(express.static(TRACKER_DIR, { maxAge: 0 }));

function readUsers(){ try{ return JSON.parse(fs.readFileSync(USERS_FILE,'utf-8')); }catch{ return [] } }
function writeUsers(u){ fs.writeFileSync(USERS_FILE, JSON.stringify(u,null,2)); }
function progPath(uid){ return path.join(PROG_DIR, uid+'.json'); }
function readProg(uid){
  const p=progPath(uid);
  if(!fs.existsSync(p)) return {topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}, lcUser:'', _time:{}, companyPrefs:{ target:'', timeframe:'all' }};
  try{
    const d=JSON.parse(fs.readFileSync(p,'utf-8'));
    if(!d.companyPrefs) d.companyPrefs={ target:'', timeframe:'all' };
    if(!d._time) d._time={};
    return d;
  }catch{ return {topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}, lcUser:'', _time:{}, companyPrefs:{ target:'', timeframe:'all' }} }
}
function writeProg(uid, data){ fs.writeFileSync(progPath(uid), JSON.stringify(data,null,2)); }

function auth(req,res,next){
  const h=req.headers.authorization||'';
  const token=h.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'no token'});
  try{ const d=jwt.verify(token, JWT_SECRET); req.user=d; next(); }catch{ return res.status(401).json({error:'bad token'}); }
}

// Validation schemas
const passwordSchema = z.string().min(8, 'Password min 8 chars').regex(/[A-Za-z]/, 'need letter').regex(/[0-9]/, 'need number');
const registerSchema = z.object({ email: z.string().email(), password: passwordSchema, name: z.string().min(1).max(80).optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function validate(schema, data){
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
    const err = new Error('Validation failed'); err.status = 400; err.details = details; throw err;
  }
  return r.data;
}

// LC cache (5 min TTL, avoids hammering external APIs)
const lcCache = new Map();
function lcCacheGet(k){ const e=lcCache.get(k); if(!e) return null; if(e.exp < Date.now()){ lcCache.delete(k); return null;} return e.v;}
function lcCacheSet(k,v,ttl=300_000){ lcCache.set(k,{v, exp: Date.now()+ttl}); }

// Auth routes with rate limiting + validation + lockout light
const failedAttempts = new Map(); // email -> {count, lockedUntil}
function isLocked(email){
  const e=failedAttempts.get(email.toLowerCase());
  if(!e) return false;
  if(e.lockedUntil && e.lockedUntil > Date.now()) return e.lockedUntil;
  if(e.lockedUntil && e.lockedUntil <= Date.now()){ failedAttempts.delete(email.toLowerCase()); return false; }
  return false;
}
function recordFail(email){
  const k=email.toLowerCase();
  const cur=failedAttempts.get(k)||{count:0, lockedUntil:null};
  cur.count+=1;
  if(cur.count % 5 === 0){ cur.lockedUntil = Date.now() + 60_000 * Math.min(15, Math.pow(2, Math.floor(cur.count/5)-1)); }
  failedAttempts.set(k, cur);
  return cur;
}
function clearFail(email){ failedAttempts.delete(email.toLowerCase()); }

app.post('/api/register', authLimiter, async (req,res,next)=>{
  try{
    const { email, password, name } = validate(registerSchema, req.body);
    const users=readUsers();
    if(users.find(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(400).json({error:'email exists'});
    const hash=await bcrypt.hash(password, 10);
    const user={id: Date.now().toString(36)+Math.random().toString(36).slice(2), email: email.toLowerCase(), name: name||email.split('@')[0], password: hash, created: new Date().toISOString()};
    users.push(user);
    writeUsers(users);
    writeProg(user.id, {topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}, lcUser:'', _time:{}, companyPrefs:{ target:'', timeframe:'all' }});
    const token=jwt.sign({id:user.id, email:user.email, name:user.name}, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN});
    res.json({token, user:{id:user.id, email:user.email, name:user.name}});
  } catch(e){ next(e); }
});

app.post('/api/login', authLimiter, async (req,res,next)=>{
  try{
    const { email, password } = validate(loginSchema, req.body);
    const lockedUntil = isLocked(email);
    if(lockedUntil){ return res.status(429).json({error:'Too many failed attempts - try again soon', retry_after: Math.ceil((lockedUntil - Date.now())/1000)}); }
    const users=readUsers();
    const u=users.find(x=>x.email.toLowerCase()===email.toLowerCase());
    if(!u){ recordFail(email); return res.status(401).json({error:'no user'}); }
    const ok=await bcrypt.compare(password, u.password);
    if(!ok){ recordFail(email); return res.status(401).json({error:'bad password'}); }
    clearFail(email);
    const token=jwt.sign({id:u.id, email:u.email, name:u.name}, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN});
    res.json({token, user:{id:u.id, email:u.email, name:u.name}});
  } catch(e){ next(e); }
});

app.get('/api/me', auth, (req,res)=>{
  res.json({user:req.user});
});

app.get('/api/progress', auth, (req,res)=>{
  res.json(readProg(req.user.id));
});

app.post('/api/progress', auth, (req,res)=>{
  const cur=readProg(req.user.id);
  const incoming=req.body||{};
  const merged={...cur, ...incoming, topics:{...cur.topics, ...(incoming.topics||{})}, questions:{...cur.questions, ...(incoming.questions||{})}, notes:{...cur.notes, ...(incoming.notes||{})}, topicNotes:{...cur.topicNotes, ...(incoming.topicNotes||{})}, chapterNotes:{...cur.chapterNotes, ...(incoming.chapterNotes||{})}, _time:{...cur._time, ...(incoming._time||{})}};
  if(incoming.lcUser!==undefined) merged.lcUser=incoming.lcUser;
  if(incoming.companyPrefs!==undefined) merged.companyPrefs={ ...(cur.companyPrefs||{}), ...(incoming.companyPrefs||{}) };
  writeProg(req.user.id, merged);
  res.json(merged);
});

// Company-wise data (liquidslr)
const COMPANY_META_PATH = path.join(TRACKER_DIR, 'data', 'companies_meta.json');
const COMPANY_INDEX_PATH = path.join(TRACKER_DIR, 'data', 'company_index.json');
const COMPANIES_DIR_PATH = path.join(TRACKER_DIR, 'data', 'companies');

let companiesMetaCache=null;
let companiesMetaMtime=0;
function getCompaniesMeta(){
  try{
    const st=fs.statSync(COMPANY_META_PATH);
    if(companiesMetaCache && st.mtimeMs===companiesMetaMtime) return companiesMetaCache;
    companiesMetaCache=JSON.parse(fs.readFileSync(COMPANY_META_PATH,'utf-8'));
    companiesMetaMtime=st.mtimeMs;
    return companiesMetaCache;
  }catch{ return {companies:[], totalCompanies:0, updated:null}; }
}
let companyIndexCache=null;
let companyIndexMtime=0;
function getCompanyIndex(){
  try{
    const st=fs.statSync(COMPANY_INDEX_PATH);
    if(companyIndexCache && st.mtimeMs===companyIndexMtime) return companyIndexCache;
    companyIndexCache=JSON.parse(fs.readFileSync(COMPANY_INDEX_PATH,'utf-8'));
    companyIndexMtime=st.mtimeMs;
    return companyIndexCache;
  }catch{ return {}; }
}
const companyFileCache=new Map(); // slug -> {data, mtime}
function getCompanyFile(slug){
  const clean=(slug||'').toLowerCase().replace(/[^a-z0-9-]/g,'-');
  const p=path.join(COMPANIES_DIR_PATH, clean+'.json');
  if(!fs.existsSync(p)) return null;
  const st=fs.statSync(p);
  const cached=companyFileCache.get(clean);
  if(cached && cached.mtime===st.mtimeMs) return cached.data;
  const data=JSON.parse(fs.readFileSync(p,'utf-8'));
  companyFileCache.set(clean, {data, mtime:st.mtimeMs});
  return data;
}

// GET /api/companies - list with counts
app.get('/api/companies', (req,res)=>{
  const meta=getCompaniesMeta();
  // support search ?q=am
  const q=(req.query.q||'').toString().toLowerCase().trim();
  let companies=meta.companies||[];
  if(q){
    companies=companies.filter(c=> c.name.toLowerCase().includes(q) || c.slug.includes(q));
  }
  res.json({ updated: meta.updated, totalCompanies: companies.length, companies });
});

// GET /api/company/:slug - questions for a company with filters
app.get('/api/company/:slug', (req,res)=>{
  const slug=(req.params.slug||'').toLowerCase();
  const timeframe=(req.query.timeframe||'all').toString(); // 30d|3m|6m|gt6m|all
  const sort=(req.query.sort||'frequency').toString(); // frequency|title|difficulty
  const difficulty=(req.query.difficulty||'').toString(); // Easy|Medium|Hard
  const search=(req.query.q||'').toString().toLowerCase().trim();
  const minFreq=Number(req.query.minFreq||0);
  const page=Math.max(1, Number(req.query.page||1));
  const limit=Math.min(200, Math.max(1, Number(req.query.limit||50)));

  const data=getCompanyFile(slug);
  if(!data) return res.status(404).json({error:'company not found', slug});
  const tfKey=['30d','3m','6m','gt6m','all'].includes(timeframe) ? timeframe : 'all';
  let questions=(data.timeframes && data.timeframes[tfKey]) ? [...data.timeframes[tfKey]] : [];

  if(difficulty) questions=questions.filter(q=> q.difficulty===difficulty);
  if(minFreq) questions=questions.filter(q=> q.frequency >= minFreq);
  if(search){
    questions=questions.filter(q=> q.title.toLowerCase().includes(search) || String(q.lcId||'').includes(search) || q.slug.includes(search) || (q.topics||[]).join(' ').toLowerCase().includes(search));
  }
  if(sort==='frequency') questions.sort((a,b)=> b.frequency - a.frequency);
  else if(sort==='title') questions.sort((a,b)=> a.title.localeCompare(b.title));
  else if(sort==='difficulty'){
    const order={Easy:0, Medium:1, Hard:2};
    questions.sort((a,b)=> (order[a.difficulty]??1)-(order[b.difficulty]??1));
  }

  const total=questions.length;
  const start=(page-1)*limit;
  const paged=questions.slice(start, start+limit);

  // If auth, inject progress status
  let withStatus=paged;
  const h=req.headers.authorization||'';
  const token=h.replace('Bearer ','');
  if(token){
    try{
      const decoded=jwt.verify(token, JWT_SECRET);
      const prog=readProg(decoded.id);
      withStatus=paged.map(q=>{
        const key=q.lcId ? `LC${q.lcId}` : `SLUG:${q.slug}`;
        let status='todo';
        if(q.lcId && prog.questions[`LC${q.lcId}`]) status=prog.questions[`LC${q.lcId}`];
        else if(prog.questions[key]) status=prog.questions[key];
        return {...q, status};
      });
    }catch{}
  }

  res.json({
    company: data.name,
    slug: data.slug,
    timeframe: tfKey,
    counts: data.counts,
    updated: data.updated,
    total,
    page,
    limit,
    questions: withStatus
  });
});

// GET /api/question/:lcId/companies - which companies ask this question (deduped by company, highest freq)
app.get('/api/question/:lcId/companies', (req,res)=>{
  let id=req.params.lcId?.toString().trim();
  if(!id) return res.status(400).json({error:'lcId'});
  if(!id.startsWith('LC')) id='LC'+id.replace(/^LC/,'');
  const idx=getCompanyIndex();
  const raw=idx[id]||[];
  // dedup by slug keep max freq
  const map=new Map();
  for(const e of raw){
    const prev=map.get(e.slug);
    if(!prev || e.frequency > prev.frequency) map.set(e.slug, e);
  }
  const arr=[...map.values()].sort((a,b)=> b.frequency - a.frequency);
  res.json({ lcId: id, companies: arr, total: arr.length });
});

// GET /api/companies/index - full inverted index stats (optional)
app.get('/api/companies/index', (req,res)=>{
  const idx=getCompanyIndex();
  res.json({ totalKeys: Object.keys(idx).length, sample: Object.entries(idx).slice(0,5) });
});

app.get('/api/lc/:username', async (req,res)=>{
  const username=req.params.username?.trim();
  if(!username) return res.status(400).json({error:'username'});
  const cacheKey = 'lc:'+username.toLowerCase();
  const cached = lcCacheGet(cacheKey);
  if(cached) return res.json(cached);
  const urls=[
    `https://alfa-leetcode-api.onrender.com/${username}/acSubmission`,
    `https://leetcode-stats-api.herokuapp.com/${username}`
  ];
  for(const url of urls){
    try{
      const r=await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(8000)});
      if(!r.ok) continue;
      const j=await r.json();
      const payload={source:url, data:j, cached:false};
      lcCacheSet(cacheKey, payload);
      return res.json(payload);
    }catch(e){ continue; }
  }
  res.status(502).json({error:'could not fetch LC'});
});

// SPA fallback
app.get('*', (req,res)=>{
  if (req.path.startsWith('/api')) return res.status(404).json({error:'not found'});
  res.sendFile(path.join(TRACKER_DIR,'index.html'));
});

// Error handler
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const payload = { error: err.message || 'Internal error' };
  if (err.details) payload.details = err.details;
  if (status >= 500) logger.error({ err, reqId: req.id }, 'unhandled error');
  else logger.warn({ err: err.message, reqId: req.id }, 'request error');
  res.status(status).json(payload);
});

export default app;
export { app };

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
let server;
if (isDirectRun) {
  server = app.listen(PORT, ()=> logger.info(`DSA Tracker server at http://localhost:${PORT} — serving ${TRACKER_DIR} (${NODE_ENV})`));
  function shutdown(signal){
    logger.info({ signal }, 'shutting down gracefully');
    server.close(() => {
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(()=> process.exit(1), 10_000).unref();
  }
  process.on('SIGINT', ()=> shutdown('SIGINT'));
  process.on('SIGTERM', ()=> shutdown('SIGTERM'));
}
